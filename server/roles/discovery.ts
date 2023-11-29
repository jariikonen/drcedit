/* eslint-disable import/extensions */
import dgram from 'dgram';
import { Buffer } from 'node:buffer';
import {
  NETWORK_INFO,
  HOST,
  DISCOVERY_PORT,
  PRIORITY,
} from '../utils/config.ts';
import logger from '../utils/logger.ts';
import { NodeInfo, NodeList } from '../types.ts';
import { getPriorityNumber } from '../utils/networkinfo.ts';

const SEND_INTERVAL = 5000;

const nodes: NodeInfo[] = [];
let joinInterval: NodeJS.Timeout | null = null;
const helloInterval: Record<string, NodeJS.Timeout> = {};

function validAddress(str: string) {
  const m = str.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  return (
    m != null &&
    parseInt(m[1], 10) <= 255 &&
    parseInt(m[2], 10) <= 255 &&
    parseInt(m[3], 10) <= 255 &&
    parseInt(m[4], 10) <= 255
  );
}

interface DiscoveryParseResult {
  type: string;
  address: string;
  valid: boolean;
  parts: string[];
}

function parseDiscoveryMessage(msg: Buffer): DiscoveryParseResult {
  const msgSplit = msg.toString().split(' ');
  const type =
    msgSplit[0] === 'JOIN' || msgSplit[0] === 'HELLO' || msgSplit[0] === 'ACK'
      ? msgSplit[0]
      : 'INVALID';
  const address =
    msgSplit[1] && validAddress(msgSplit[1]) ? msgSplit[1] : 'INVALID';
  const valid = type !== 'INVALID' && address !== 'INVALID';
  return { type, address, valid, parts: msgSplit };
}

function parseNodeList(str: string): NodeList {
  const nodeStrArray: unknown = JSON.parse(str);
  if (!Array.isArray(nodeStrArray)) {
    throw new Error(`Wrong type for NodeList - not an array ('${str}')`);
  }
  const nodeList: NodeList = [];
  if (nodeStrArray.length > 0) {
    nodeStrArray.forEach((nodeStr) => {
      if (typeof nodeStr === 'string' && validAddress(nodeStr)) {
        nodeList.push(nodeStr);
      }
    });
  }
  return nodeList;
}

function addNodes(nodeList: NodeList) {
  nodeList.forEach((address) => {
    if (!nodes.find((node) => node.address === address) && address !== HOST) {
      nodes.push({
        address,
        priority: getPriorityNumber(address, NETWORK_INFO.netmask),
      });
    }
  });
}

function handleJoin(
  parsedMsg: DiscoveryParseResult,
  remote: dgram.RemoteInfo,
  socket: dgram.Socket
): void {
  // add address to nodes array if message is from another node (not self) and
  // the node is not in the array already
  if (
    remote.address !== HOST &&
    !nodes.find((node) => node.address === remote.address)
  ) {
    logger.info(
      `RECEIVED VALID JOIN FROM ${remote.address}:${
        remote.port
      } ('${parsedMsg.parts.join(' ')}')`
    );
    nodes.push({
      address: remote.address,
      priority: getPriorityNumber(remote.address, NETWORK_INFO.netmask),
    });

    if (!(remote.address in helloInterval)) {
      const hello = Buffer.from(
        `HELLO ${HOST} ${JSON.stringify([
          ...nodes.map((node) => node.address),
          HOST,
        ])}`
      );
      helloInterval[remote.address] = setInterval(() => {
        socket.send(hello, 0, hello.length, remote.port, remote.address);
        logger.info(`SENDING HELLO TO ${remote.address}:${remote.port}`);
        logger.info(`NODES '${JSON.stringify(nodes)}'`);
      }, SEND_INTERVAL);
    }
  }
}

function handleHello(
  parsedMsg: DiscoveryParseResult,
  remote: dgram.RemoteInfo,
  socket: dgram.Socket
): void {
  if (joinInterval) {
    // stop sending JOIN messages
    clearInterval(joinInterval);

    logger.info(`RECEIVED HELLO ${JSON.stringify(parsedMsg.parts)}`);

    // add any new nodes in the message to the nodes array
    if (parsedMsg.parts[2]) {
      const nodeList: NodeList = parseNodeList(parsedMsg.parts[2]);
      addNodes(nodeList);
    }

    // send an ACK message
    const ack = Buffer.from(
      `ACK ${HOST} ${JSON.stringify([
        ...nodes.map((node) => node.address),
        HOST,
      ])}`
    );
    socket.send(ack, 0, ack.length, remote.port, remote.address);
    logger.info(`SENDING ACK TO ${remote.address}:${remote.port}`);
    logger.info(`NODES '${JSON.stringify(nodes)}'`);
  }
}

function handleAck(
  parsedMsg: DiscoveryParseResult,
  remote: dgram.RemoteInfo
): void {
  // stop sending HELLO message to this address
  if (remote.address in helloInterval) {
    clearInterval(helloInterval[remote.address]);
    delete helloInterval[remote.address];
  }

  // add any new nodes in message to nodes array
  if (parsedMsg.parts[2]) {
    const nodeList: NodeList = parseNodeList(parsedMsg.parts[2]);
    addNodes(nodeList);
  }
  logger.info(`handleAck: NODES ${JSON.stringify(nodes).toString()}`);
}

export default function discovery() {
  const socket = dgram.createSocket('udp4');
  const messageToSend = Buffer.from(`JOIN ${HOST}`);

  // when socket is ready ...
  socket.on('listening', () => {
    const socketAddress = socket.address();
    logger.info(
      `ADDRESS: ${HOST}, MASK: ${NETWORK_INFO.netmask}, PRIORITY: ${PRIORITY}`
    );
    logger.info(`DISCOVERY RUNNING ON PORT ${socketAddress.port}`);
    // ... send a JOIN message every 5 seconds
    socket.setBroadcast(true);
    joinInterval = setInterval(() => {
      socket.send(
        messageToSend,
        0,
        messageToSend.length,
        DISCOVERY_PORT,
        NETWORK_INFO.broadcast
      );
    }, SEND_INTERVAL);
    logger.info(`NODES ${JSON.stringify(nodes).toString()}`);
  });

  socket.on('message', (msg, remote) => {
    const parsedMessage = parseDiscoveryMessage(msg);
    if (!parsedMessage.valid) {
      logger.error(
        `INVALID MESSAGE FROM ${remote.address}:${
          remote.port
        } ('${msg.toString()}')`
      );
    }

    switch (parsedMessage.type) {
      case 'JOIN':
        handleJoin(parsedMessage, remote, socket);
        break;
      case 'HELLO':
        handleHello(parsedMessage, remote, socket);
        break;
      case 'ACK':
        handleAck(parsedMessage, remote);
        break;
      default:
        logger.error(`Unknown message type ${parsedMessage.type}`);
    }
  });

  socket.bind(DISCOVERY_PORT);
}
