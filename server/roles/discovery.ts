/* eslint-disable import/extensions */
import dgram from 'dgram';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import {
  NETWORK_INFO,
  HOST,
  DISCOVERY_PORT,
  PRIORITY,
} from '../utils/config.ts';
import logger from '../utils/logger.ts';
import { NodeInfo, NodeList } from '../types.ts';
import { getPriorityNumber, validAddress } from '../utils/networkinfo.ts';

interface DiscoveryParseResult {
  type: string;
  address: string;
  valid: boolean;
  parts: string[];
}

export default class Discovery extends EventEmitter {
  static SEND_INTERVAL = 5000;

  #nodes: NodeInfo[] = [];

  #joinInterval: NodeJS.Timeout | null = null;

  #helloInterval: Record<string, NodeJS.Timeout> = {};

  #socket: dgram.Socket;

  constructor() {
    super();
    this.#socket = dgram.createSocket('udp4');

    const joinMessage = Buffer.from(`JOIN ${HOST}`);

    // when socket is ready ...
    this.#socket.on('listening', () => {
      const socketAddress = this.#socket.address();
      logger.info(
        `address: ${HOST}, mask: ${NETWORK_INFO.netmask}, priority: ${PRIORITY}`
      );
      logger.info(`discovery running on port ${socketAddress.port}`);
      // ... send a JOIN message every 5 seconds
      this.#socket.setBroadcast(true);
      this.#joinInterval = setInterval(() => {
        this.#socket.send(
          joinMessage,
          0,
          joinMessage.length,
          DISCOVERY_PORT,
          NETWORK_INFO.broadcast
        );
        logger.info(
          `sending JOIN to ${NETWORK_INFO.broadcast}:${DISCOVERY_PORT} (broadcast)`
        );
        logger.debug(`sent JOIN message: '${joinMessage.toString('utf-8')}'`);
      }, Discovery.SEND_INTERVAL);
    });

    this.#socket.on('message', (msg, remote) => {
      const parsedMessage = Discovery.#parseDiscoveryMessage(msg);
      if (!parsedMessage.valid) {
        logger.error(
          `invalid message from ${remote.address}:${
            remote.port
          } ('${msg.toString()}')`
        );
      }

      switch (parsedMessage.type) {
        case 'JOIN':
          this.#handleJoin(parsedMessage, remote);
          break;
        case 'HELLO':
          this.#handleHello(parsedMessage, remote);
          break;
        case 'ACK':
          this.#handleAck(parsedMessage, remote);
          break;
        default:
          logger.error(`unknown message type ${parsedMessage.type}`);
      }
    });
  }

  bind(port: number) {
    this.#socket?.bind(port);
  }

  static #parseDiscoveryMessage(msg: Buffer): DiscoveryParseResult {
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

  static #parseNodeList(str: string): NodeList {
    const nodeStrArray: unknown = JSON.parse(str);
    if (!Array.isArray(nodeStrArray)) {
      throw new Error(`wrong type for NodeList - not an array ('${str}')`);
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

  #addNodes(nodeList: NodeList) {
    nodeList.forEach((address) => {
      if (
        !this.#nodes.find((node) => node.address === address) &&
        address !== HOST
      ) {
        this.#nodes.push({
          address,
          priority: getPriorityNumber(address, NETWORK_INFO.netmask),
        });
        this.emit('nodes', this.#nodes);
      }
    });
  }

  #handleJoin(parsedMsg: DiscoveryParseResult, remote: dgram.RemoteInfo): void {
    // add address to nodes array if message is from another node (not self) and
    // the node is not in the array already
    if (
      remote.address !== HOST &&
      !this.#nodes.find((node) => node.address === remote.address)
    ) {
      logger.info(`received JOIN from ${remote.address}:${remote.port}`);
      logger.debug(`received JOIN message: '${parsedMsg.parts.join(' ')}'`);
      this.#nodes.push({
        address: remote.address,
        priority: getPriorityNumber(remote.address, NETWORK_INFO.netmask),
      });
      this.emit('nodes', this.#nodes);

      if (!(remote.address in this.#helloInterval)) {
        const hello = Buffer.from(
          `HELLO ${HOST} ${JSON.stringify([
            ...this.#nodes.map((node) => node.address),
            HOST,
          ])}`
        );
        this.#helloInterval[remote.address] = setInterval(() => {
          this.#socket.send(
            hello,
            0,
            hello.length,
            remote.port,
            remote.address
          );
          logger.info(`sending HELLO to ${remote.address}:${remote.port}`);
          logger.debug(`sent HELLO message: '${hello.toString('utf-8')}'`);
        }, Discovery.SEND_INTERVAL);
      }
    }
  }

  #handleHello(
    parsedMsg: DiscoveryParseResult,
    remote: dgram.RemoteInfo
  ): void {
    if (this.#joinInterval) {
      // stop sending JOIN messages
      clearInterval(this.#joinInterval);

      logger.info(`received HELLO from ${remote.address}:${remote.port}`);
      logger.debug(`received HELLO message: '${parsedMsg.parts.join(' ')}'`);

      // add any new nodes in the message to the nodes array
      if (parsedMsg.parts[2]) {
        const nodeList: NodeList = Discovery.#parseNodeList(parsedMsg.parts[2]);
        this.#addNodes(nodeList);
      }

      // send an ACK message
      const ack = Buffer.from(
        `ACK ${HOST} ${JSON.stringify([
          ...this.#nodes.map((node) => node.address),
          HOST,
        ])}`
      );
      this.#socket.send(ack, 0, ack.length, remote.port, remote.address);
      logger.info(`sending ACK to ${remote.address}:${remote.port}`);
      logger.debug(`sent ACK message: '${ack.toString('utf-8')}'`);
    }
  }

  #handleAck(parsedMsg: DiscoveryParseResult, remote: dgram.RemoteInfo): void {
    logger.info(`received ACK from ${remote.address}:${remote.port}`);
    logger.debug(`received ACK message: '${parsedMsg.parts.join(' ')}'`);

    // stop sending HELLO message to this address
    if (remote.address in this.#helloInterval) {
      clearInterval(this.#helloInterval[remote.address]);
      delete this.#helloInterval[remote.address];
    }

    // add any new nodes in message to nodes array
    if (parsedMsg.parts[2]) {
      const nodeList: NodeList = Discovery.#parseNodeList(parsedMsg.parts[2]);
      this.#addNodes(nodeList);
    }
  }
}
