/* eslint-disable import/extensions */
import dgram from 'dgram';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import {
  NETWORK_INFO,
  HOST,
  DISCOVERY_PORT,
  DISCOVERY_MESSAGE_INTERVAL,
  DISCOVERY_MESSAGE_TIMEOUT,
  DISCOVERY_PREELECTION_TIMEOUT,
  PRIORITY,
} from '../utils/config.ts';
import logger from '../utils/logger.ts';
import {
  CoordinatorMsgNodeInfo,
  NodeInfo,
  NodeList,
  isCoordinatorMsgNodeInfo,
} from '../types.ts';
import { getPriorityNumber, validAddress } from '../utils/networkinfo.ts';

type DiscoveryMessageType =
  | 'JOIN'
  | 'HELLO'
  | 'ACK'
  | 'ELECTION'
  | 'OK'
  | 'COORDINATOR'
  | 'ASSIGN';

type DiscoveryResponseType = 'HELLO' | 'COORDINATOR' | 'ASSIGN';

interface DiscoveryParseResult {
  type: DiscoveryMessageType;
  parts: string[];
  nodeList?: NodeList;
  nodeInfo?: CoordinatorMsgNodeInfo[];
  responseType?: DiscoveryResponseType;
}

/**
 * Discovery server is takes care of finding other nodes within the same
 * subnetwork. It sends JOIN messages as UDP datagrams to the broadcast address
 * of the subnetwork and listens for incomming messages. Nodes should respond
 * to JOIN with a HELLO message which contains a list of nodes the sender
 * currently knows. HELLO should then be responded with an ACK message also
 * containing a list of nodes that the sender knows at that moment.
 *
 * Server stops sending the JOIN messages after receiving the first HELLO, but
 * continues listening for incoming messages. After the first HELLO it knows at
 * least one other node in the network and is able to add more nodes to its list
 * when it receives more JOIN messages.
 *
 * When receiving a JOIN message the server will try to send a HELLO message
 * to the node as long as it gets a reply (ACK) or it times out. The timeout
 * interval can be set using the config variable DISCOVERY_MSG_TIMEOUT.
 *
 * When the server receives information about new nodes it will add them to
 * its nodes array and emit a 'newNodes' event. A copy of the nodes array is
 * passed as an event parameter.
 *
 * When receiving information about new nodes the server also starts a leader
 * election process using the Bully algorithm, after waiting for a short time
 * for new messages to arrive. The length of the wait can be set using the
 * config variable DISCOVERY_PREELECTION_TIMEOUT.
 *
 * The host identifier part of the node's IP address is used as the priority
 * number in the election process. If the node does not have the highest
 * priority of the nodes it knows, it sends an ELECTION message to the nodes
 * that have a higher priority. If those nodes are alive they respond with OK
 * message. If the node, however, has the highest priority of the nodes it
 * knows, it sends a COORDINATOR message to all the other nodes. Along the
 * message it sends a list of all the nodes it knows. The list also contains
 * information about new roles of the nodes - one of the nodes is assigned as a
 * message broker and another as a gateway.
 *
 * By sending the COORDINATOR message the highest priority node "bullies" the
 * the other nodes to accept its leading role. They don't, however, accept it
 * without checking that the node really has the highest priority by finding
 * out the priority number themselves from the node's IP address and the
 * network mask. If the node really has the highest priority, the other nodes
 * stop the election process and respond with ACK.
 *
 * The node elected as the leader takes on the role of message broker itself,
 * and assigns the role of gateway to the node with the smallest priority. It
 * communicates both of these actions in the COORDINATOR message. If the
 * gateway is assumed to have failed, the leader/message broker can assign a
 * new gateway using an ASSIGN message.
 *
 * Server is started by calling the bind method, which binds it to a port.
 */
export default class Discovery extends EventEmitter {
  #nodes: NodeInfo[] = [];

  #joinInterval: NodeJS.Timeout | null = null;

  #helloInterval: Record<string, NodeJS.Timeout> = {};

  #helloTimeout: Record<string, NodeJS.Timeout> = {};

  #socket: dgram.Socket;

  #preElectionTimeout: NodeJS.Timeout | null = null;

  #electionInterval: Record<string, NodeJS.Timeout> = {};

  #electionTimeout: Record<string, NodeJS.Timeout> = {};

  #receivedOK = false;

  #coordinatorInterval: Record<string, NodeJS.Timeout> = {};

  /**
   * Creates a new Doscovery server instance.
   */
  constructor() {
    super();
    this.#socket = dgram.createSocket('udp4');

    this.#nodes.push({
      address: HOST,
      priority: PRIORITY,
      roles: [],
    });

    const joinMessage = Buffer.from('JOIN');

    // when socket is ready ...
    this.#socket.on('listening', () => {
      const socketAddress = this.#socket.address();
      logger.info(
        `address: ${HOST}, mask: ${NETWORK_INFO.netmask}, priority: ${PRIORITY}`
      );
      logger.info(`discovery running on port ${socketAddress.port}`);

      // ... send a JOIN message at intervals
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
        logger.debug(
          `JOIN message content (sent): '${joinMessage.toString('utf-8')}'`
        );
      }, DISCOVERY_MESSAGE_INTERVAL);
    });

    // and add event listener to handle received messages
    this.#socket.on('message', (msg, remote) => {
      logger.debug(
        `message from ${remote.address}:${remote.port}: ${msg.toString()}`
      );
      let parsedMessage;
      try {
        parsedMessage = Discovery.#parseDiscoveryMessage(msg);
      } catch (error) {
        logger.error(
          error,
          `invalid message from ${remote.address}:${remote.port}`
        );
        return;
      }

      try {
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
          case 'ELECTION':
            this.#handleElection(remote);
            break;
          case 'OK':
            this.#handleOK(remote);
            break;
          case 'COORDINATOR':
            this.#handleCoordinator(parsedMessage, remote);
            break;
          case 'ASSIGN':
            logger.info(
              `received an ASSIGN message from ${remote.address}:${remote.port}`
            );
            logger.error(
              'ASSIGN message handling has not been implemented yet'
            );
            break;
          default:
            throw new Error('ran out of message types');
        }
      } catch (error) {
        logger.error(
          error,
          `invalid ${parsedMessage.type} message from ${remote.address}:${remote.port}`
        );
      }
    });
  }

  /**
   * Binds the Discovery server to a port and starts the server.
   * @param port The port number to listen on.
   */
  bind(port: number) {
    this.#socket?.bind(port);
  }

  static #parseDiscoveryMessage(msg: Buffer): DiscoveryParseResult {
    const msgSplit = msg.toString().split(' ');
    const type = Discovery.#parseType(msgSplit[0]);

    switch (type) {
      case 'HELLO':
        return Discovery.#parseHello(msgSplit, type);
      case 'ACK':
        return Discovery.#parseAck(msgSplit, type);
      case 'COORDINATOR':
        return Discovery.#parseCoordinator(msgSplit, type);
      default:
        return { type, parts: msgSplit };
    }
  }

  static #parseType(str: string): DiscoveryMessageType {
    const type =
      str === 'JOIN' ||
      str === 'HELLO' ||
      str === 'ACK' ||
      str === 'ELECTION' ||
      str === 'OK' ||
      str === 'COORDINATOR' ||
      str === 'ASSIGN'
        ? str
        : 'INVALID';
    if (type === 'INVALID') {
      throw new Error(`invalid message type '${str}'`);
    }
    return type;
  }

  static #parseHello(
    msgSplit: string[],
    type: DiscoveryMessageType
  ): DiscoveryParseResult {
    if (!msgSplit[1]) {
      throw new Error(
        'node list missing - HELLO message must contain a node list'
      );
    }
    const nodeList = Discovery.#parseNodeList(msgSplit[1]);
    return { type, parts: msgSplit, nodeList };
  }

  static #parseAck(
    msgSplit: string[],
    type: DiscoveryMessageType
  ): DiscoveryParseResult {
    if (!msgSplit[1]) {
      throw new Error(
        'invalid ACK message - an ACK message must contain the type of the message to which the message is a response to'
      );
    }
    const responseType =
      msgSplit[1] === 'HELLO' ||
      msgSplit[1] === 'COORDINATOR' ||
      msgSplit[1] === 'ASSIGN'
        ? msgSplit[1]
        : 'INVALID';
    if (responseType === 'INVALID') {
      throw new Error(`invalid response type ${msgSplit[1]}`);
    }
    switch (responseType) {
      case 'HELLO':
        return Discovery.#parseAckHello(msgSplit, type, responseType);
        break;
      case 'COORDINATOR':
        return Discovery.#parseAckCoordinator(msgSplit, type, responseType);
        break;
      default:
        throw new Error('out of response types');
    }
  }

  static #parseAckHello(
    msgSplit: string[],
    type: DiscoveryMessageType,
    responseType: DiscoveryResponseType
  ): DiscoveryParseResult {
    if (!msgSplit[2]) {
      throw new Error(
        'invalid ACK message - an ACK HELLO message must contain a node list'
      );
    }
    const nodeList = Discovery.#parseNodeList(msgSplit[2]);
    return { type, parts: msgSplit, nodeList, responseType };
  }

  static #parseAckCoordinator(
    msgSplit: string[],
    type: DiscoveryMessageType,
    responseType: DiscoveryResponseType
  ): DiscoveryParseResult {
    if (!msgSplit[2]) {
      throw new Error(
        'invalid ACK message - an ACK COORDINATOR message must contain a node data section'
      );
    }
    const nodeInfo = Discovery.#parseCoordMsgNodeData(msgSplit[2]);
    return { type, parts: msgSplit, nodeInfo, responseType };
  }

  static #parseNodeList(str: string): NodeList {
    const nodeStrArray: unknown = JSON.parse(str);
    if (!Array.isArray(nodeStrArray)) {
      throw new Error(`wrong type for a node list - not an array '${str}'`);
    }
    const nodeList: NodeList = [];
    if (nodeStrArray.length > 0) {
      nodeStrArray.forEach((nodeStr) => {
        if (typeof nodeStr !== 'string') {
          throw new Error(
            `wrong type of element on node list - not a string '${nodeStr}'`
          );
        }
        if (!validAddress(nodeStr)) {
          throw new Error(
            `wrong type of element on node list - not a valid IP address '${nodeStr}'`
          );
        }
        nodeList.push(nodeStr);
      });
    }
    return nodeList;
  }

  static #parseCoordinator(msgSplit: string[], type: DiscoveryMessageType) {
    const nodeInfo = Discovery.#parseCoordMsgNodeData(msgSplit[1]);
    return { type, parts: msgSplit, nodeInfo };
  }

  static #parseCoordMsgNodeData(str: string): CoordinatorMsgNodeInfo[] {
    const nodeData: unknown = JSON.parse(str);
    if (!Array.isArray(nodeData)) {
      throw new Error(`wrong type for a node list - not an array '${str}'`);
    }
    const validNodeData: CoordinatorMsgNodeInfo[] = nodeData.map(
      (node: object) => {
        if (!isCoordinatorMsgNodeInfo(node)) {
          throw new Error(
            `not a valid CoordinatorMsgNodeInfo ${JSON.stringify(node)}`
          );
        }
        return node;
      }
    );
    return validNodeData;
  }

  /**
   * NOTICE! This is the only place to add nodes to the object's nodes array!
   */
  #addNodes(nodeList: NodeList) {
    let newNodes = false;
    nodeList.forEach((address) => {
      if (
        address !== HOST &&
        !this.#nodes.find((node) => node.address === address)
      ) {
        newNodes = true;
        this.#nodes.push({
          address,
          priority: getPriorityNumber(address, NETWORK_INFO.netmask),
          roles: [],
        });
      }
    });
    if (newNodes) {
      if (this.#preElectionTimeout) {
        clearTimeout(this.#preElectionTimeout);
      }
      this.#preElectionTimeout = setTimeout(() => {
        logger.info('pre-election timeout expired');
        this.#startElection();
      }, DISCOVERY_PREELECTION_TIMEOUT);
      this.emit('newNodes', [...this.#nodes]);
    }
  }

  #handleJoin(parsedMsg: DiscoveryParseResult, remote: dgram.RemoteInfo): void {
    if (remote.address !== HOST) {
      logger.info(`received JOIN from ${remote.address}:${remote.port}`);
    }
    logger.debug(
      `JOIN message content (received from ${remote.address}:${
        remote.port
      }): '${parsedMsg.parts.join(' ')}'`
    );

    // add address to nodes array if message is from another node (not self/
    // host) and there is not a HELLO message interval for this node (meaning
    // that the node has not been added to the nodes list yet)
    if (remote.address !== HOST && !(remote.address in this.#helloInterval)) {
      this.#addNodes([remote.address]);

      // and start sending HELLO messages to that node
      if (!(remote.address in this.#helloInterval)) {
        const hello = Buffer.from(
          `HELLO ${JSON.stringify([
            ...this.#nodes.map((node) => node.address),
          ])}`
        );
        logger.debug(
          `start sending HELLO messages to ${remote.address}:${remote.port}`
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
          logger.debug(
            `HELLO message content (sent): '${hello.toString('utf-8')}'`
          );
        }, DISCOVERY_MESSAGE_INTERVAL);
        // stop sending messages after a timeout
        this.#helloTimeout[remote.address] = setTimeout(() => {
          logger.debug(
            `sending HELLO messages to ${remote.address}:${remote.port} TIMED OUT`
          );
          clearInterval(this.#helloInterval[remote.address]);
          delete this.#helloInterval[remote.address];
        }, DISCOVERY_MESSAGE_TIMEOUT);
      }
    }
  }

  #handleHello(
    parsedMsg: DiscoveryParseResult,
    remote: dgram.RemoteInfo
  ): void {
    logger.info(`received HELLO from ${remote.address}:${remote.port}`);
    logger.debug(
      `HELLO message content (received from ${remote.address}:${
        remote.port
      }): '${parsedMsg.parts.join(' ')}'`
    );

    // stop sending JOIN messages
    this.#stopSendingJoin();

    // add any new nodes in the message to the nodes array
    if (parsedMsg.nodeList) {
      this.#addNodes(parsedMsg.nodeList);
    }

    // send an ACK HELLO message
    const ack = Buffer.from(
      `ACK HELLO ${JSON.stringify([
        ...this.#nodes.map((node) => node.address),
      ])}`
    );
    this.#socket.send(ack, 0, ack.length, remote.port, remote.address);
    logger.info(`sending ACK HELLO to ${remote.address}:${remote.port}`);
    logger.debug(
      `ACK HELLO message content (sent): '${ack.toString('utf-8')}'`
    );

    // stop sending HELLO messages to this node
    if (this.#helloInterval[remote.address]) {
      this.#stopSendingHello(remote);
    }
  }

  #stopSendingJoin() {
    if (this.#joinInterval) {
      clearInterval(this.#joinInterval);
      this.#joinInterval = null;
      logger.info('stopped sending JOIN messages');
    }
  }

  #stopSendingHello(remote: dgram.RemoteInfo) {
    if (this.#helloInterval[remote.address]) {
      clearInterval(this.#helloInterval[remote.address]);
      delete this.#helloInterval[remote.address];
      logger.info(
        `stopped sending HELLO messages to ${remote.address}:${remote.port}`
      );
    }
    if (this.#helloTimeout[remote.address]) {
      clearTimeout(this.#helloTimeout[remote.address]);
      delete this.#helloTimeout[remote.address];
      logger.info(
        `cleared timeout for HELLO to ${remote.address}:${remote.port}`
      );
    }
  }

  #handleAck(parsedMsg: DiscoveryParseResult, remote: dgram.RemoteInfo): void {
    logger.info(
      `received ACK ${parsedMsg.responseType} from ${remote.address}:${remote.port}`
    );
    logger.debug(
      `received ACK ${parsedMsg.responseType} message (from ${remote.address}:${
        remote.port
      }): '${parsedMsg.parts.join(' ')}'`
    );

    switch (parsedMsg.responseType) {
      case 'HELLO':
        this.#handleAckHello(parsedMsg, remote);
        break;
      case 'COORDINATOR':
        this.#handleAckCoordinator(remote);
        break;
      default:
        throw new Error(`unknown response type ${parsedMsg.responseType}`);
    }
  }

  #handleAckHello(
    parsedMsg: DiscoveryParseResult,
    remote: dgram.RemoteInfo
  ): void {
    // stop sending HELLO message to this address
    if (remote.address in this.#helloInterval) {
      clearInterval(this.#helloInterval[remote.address]);
      delete this.#helloInterval[remote.address];
      logger.info(
        `stopped sending HELLO messages to ${remote.address}:${remote.port}`
      );
    }

    // add any new nodes in message to nodes array
    if (parsedMsg.nodeList) {
      this.#addNodes(parsedMsg.nodeList);
    }

    // stop sending JOIN messages
    this.#stopSendingJoin();
  }

  #handleAckCoordinator(remote: dgram.RemoteInfo): void {
    // stop sending COORDINATOR messages to this node
    if (remote.address in this.#coordinatorInterval) {
      clearInterval(this.#coordinatorInterval[remote.address]);
      delete this.#coordinatorInterval[remote.address];
    }
  }

  #startElection() {
    logger.info('starting an ELECTION PROCESS');

    // initialize state
    this.#receivedOK = false;

    const higherPriorities = this.#nodes.filter(
      (node) => node.priority > PRIORITY
    );
    // HOST does not have the highest priority
    if (higherPriorities.length > 0) {
      logger.info(
        `${HOST} has priority ${PRIORITY}, ${
          higherPriorities.length
        } node(s) with higher priority: ${JSON.stringify(higherPriorities)}`
      );
      // send ELECTION messages to higher priority nodes
      this.#sendElection(higherPriorities);
    }
    // HOST has the highest priority
    else {
      logger.info(
        `${HOST} has the HIGHEST PRIORITY (${PRIORITY}) (nodes: ${JSON.stringify(
          [...this.#nodes]
        )})`
      );
      // send COORDINATOR to all the other nodes
      this.#sendCoordinator();
    }
  }

  #sendElection(higherPriorities: NodeInfo[]): void {
    const election = Buffer.from('ELECTION');
    higherPriorities.forEach((node) => {
      this.#electionInterval[node.address] = setInterval(() => {
        this.#socket.send(
          election,
          0,
          election.length,
          DISCOVERY_PORT,
          node.address
        );
        logger.info(`sending ELECTION to ${node.address}:${DISCOVERY_PORT}`);
        logger.debug(
          `ELECTION message content (sent): '${election.toString('utf-8')}'`
        );
      }, DISCOVERY_MESSAGE_INTERVAL);

      // stop sending messages after a timeout
      this.#electionTimeout[node.address] = setTimeout(() => {
        logger.info(`ELECTION message to ${node.address} timed out`);
        clearInterval(this.#electionInterval[node.address]);
        delete this.#electionInterval[node.address];

        // since the node seems to be unresponsive, remove it from list of
        // active nodes
        logger.info(`removing ${node.address} from nodes as unresponsive`);
        const nodeIndex = this.#nodes.findIndex(
          (n) => n.address === node.address
        );
        this.#nodes.splice(nodeIndex, 1);

        if (!this.#receivedOK) {
          this.#sendCoordinator();
        }
      }, DISCOVERY_MESSAGE_TIMEOUT);
    });
  }

  #setRoles() {
    let nodes = [...this.#nodes];

    // remove previous GATEWAY and MESSAGE_BROKER roles
    nodes = nodes.map((n) => {
      if (Array.isArray(n.roles)) {
        const gatewayIndex = n.roles.findIndex((role) => role === 'GATEWAY');
        if (gatewayIndex) {
          n.roles.splice(gatewayIndex, 1);
        }
        const mbIndex = n.roles.findIndex((role) => role === 'MESSAGE_BROKER');
        if (mbIndex) {
          n.roles.splice(mbIndex, 1);
        }
      }
      return n;
    });

    // set the node with smallest priority as GATEWAY
    nodes.sort((a, b) => (a.priority > b.priority ? 1 : -1));
    nodes[0].roles.push('GATEWAY');

    // set self/HOST as MESSAGE_BROKER
    const hostIndex = nodes.findIndex((n) => n.address === HOST);
    nodes[hostIndex].roles.push('MESSAGE_BROKER');

    // update nodes array and emit a NEW ROLES event
    this.#nodes = nodes;
    logger.debug(`updated the roles: ${JSON.stringify(this.#nodes)}`);
    this.emit('newRoles', [...this.#nodes], '#setRoles');
  }

  #sendCoordinator() {
    this.#setRoles();

    // send COORDINATOR message to all other nodes on the active nodes list
    const coordinator = Buffer.from(
      `COORDINATOR ${JSON.stringify(
        this.#nodes.map((node) => ({
          address: node.address,
          roles: node.roles,
        }))
      )}`
    );
    this.#nodes.forEach((node) => {
      if (node.address === HOST) {
        return;
      }
      this.#coordinatorInterval[node.address] = setInterval(() => {
        this.#socket.send(
          coordinator,
          0,
          coordinator.length,
          DISCOVERY_PORT,
          node.address
        );
        logger.info(`sending COORDINATOR to ${node.address}:${DISCOVERY_PORT}`);
        logger.debug(
          `COORDINATOR message content (sent): '${coordinator.toString(
            'utf-8'
          )}'`
        );
      }, DISCOVERY_MESSAGE_INTERVAL);

      // stop sending messages after a timeout
      setTimeout(() => {
        clearInterval(this.#coordinatorInterval[node.address]);
        delete this.#coordinatorInterval[node.address];
      }, DISCOVERY_MESSAGE_TIMEOUT);
    });
  }

  #handleElection(remote: dgram.RemoteInfo): void {
    logger.info(
      `received an ELECTION message from ${remote.address}:${remote.port}`
    );
    const remotePriority = getPriorityNumber(
      remote.address,
      NETWORK_INFO.netmask
    );
    if (PRIORITY <= remotePriority) {
      throw new Error(
        `this ELECTION was sent in error - HOST priority (${PRIORITY}) <= ${remotePriority})`
      );
    }

    this.#stopPreElectionTimeout();

    // respond with OK
    const ok = Buffer.from('OK');
    this.#socket.send(ok, 0, ok.length, remote.port, remote.address);
    logger.info(`sending OK to ${remote.address}:${remote.port}`);
    logger.debug(`OK message content (sent): '${ok.toString('utf-8')}'`);
  }

  #stopPreElectionTimeout() {
    if (this.#preElectionTimeout) {
      clearTimeout(this.#preElectionTimeout);
      this.#preElectionTimeout = null;
    }
  }

  #handleOK(remote: dgram.RemoteInfo): void {
    this.#receivedOK = true;

    logger.info(`received an OK message from ${remote.address}:${remote.port}`);

    // if the message is valid, i.e., an ELECTION message was sent to this node
    // previously
    if (this.#electionInterval[remote.address]) {
      // ... stop the election process
      this.#stopElection();
    } else if (!this.#receivedOK) {
      throw new Error(
        `OK message from ${remote.address} is INVALID - ${HOST} has not sent ELECTION to this node`
      );
    }
  }

  #stopElection(): void {
    // stop the election process, i.e., stop sending ELECTION messages to any node
    Object.keys(this.#electionInterval).forEach((key) => {
      clearInterval(this.#electionInterval[key]);
      delete this.#electionInterval[key];
    });
    logger.debug(this.#electionInterval, 'stopped sending ELECTION messages');

    // and stop excpecting a response to previously sent ELECTION messages
    Object.keys(this.#electionTimeout).forEach((key) => {
      clearTimeout(this.#electionTimeout[key]);
      delete this.#electionTimeout[key];
    });
    logger.debug(
      this.#electionTimeout,
      'stopped waiting a response to previously sent ELECTION messages'
    );
  }

  #handleCoordinator(
    parsedMsg: DiscoveryParseResult,
    remote: dgram.RemoteInfo
  ) {
    logger.info(
      `received a COORDINATOR message from ${remote.address}:${remote.port}`
    );
    logger.debug(
      `COORDINATOR message content (from ${remote.address}:${
        remote.port
      }): ${parsedMsg.parts.join(' ')}`
    );

    // check that message is valid, i.e., the coordinator has a higher priority
    if (getPriorityNumber(remote.address, NETWORK_INFO.netmask) <= PRIORITY) {
      throw new Error(`COORDINATOR message from ${remote.address} is INVALID`);
    }

    this.#stopPreElectionTimeout();
    this.#stopElection();

    // respond with ACK COORDINATOR
    if (!parsedMsg.nodeInfo) {
      throw new Error('node info missing from the parsed message object');
    }
    const ack = Buffer.from(
      `ACK COORDINATOR ${JSON.stringify([...parsedMsg.nodeInfo])}`
    );
    this.#socket.send(ack, 0, ack.length, remote.port, remote.address);
    logger.info(`sending ACK COORDINATOR to ${remote.address}:${remote.port}`);
    logger.debug(`ACK message content (sent): '${ack.toString('utf-8')}'`);

    // update the node list and emit newRoles event
    this.#updateRoles(parsedMsg.nodeInfo);
    this.emit('newRoles', this.#nodes, '#handleCoordinator');
  }

  #updateRoles(nodeData: CoordinatorMsgNodeInfo[]) {
    if (this.#nodes.length !== nodeData.length) {
      logger.warn(
        `the node data received in a COORDINATOR message has a different number of elements (local/remote: ${
          this.#nodes.length
        }/${nodeData.length})`
      );
    }
    nodeData.forEach((node) => {
      const index = this.#nodes.findIndex((n) => n.address === node.address);
      if (index >= 0) {
        this.#nodes[index].roles = node.roles;
      } else {
        this.#nodes.push({
          address: node.address,
          priority: getPriorityNumber(node.address, NETWORK_INFO.netmask),
          roles: node.roles,
        });
      }
    });
  }
}
