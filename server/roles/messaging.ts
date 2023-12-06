/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import { Server } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { SOCKETIO_PORT_INTERNAL, HOST } from '../utils/config';
import logger from '../utils/logger';

export default class Messaging extends EventEmitter {
  #server: Server | null = null;

  #client: Socket | null = null;

  constructor(broker: boolean, brokerAddress: string | null = null) {
    super();
    // Messaging instance functions either as a Socket.io server or a Socket.io
    // client
    if (broker) {
      this.#server = new Server();
      this.#initBroker();
    } else {
      if (!brokerAddress) {
        throw new Error(
          'if Messaging instance is not a broker a brokerAddress parameter must be set'
        );
      }
      this.#client = io(`ws://${brokerAddress}:${SOCKETIO_PORT_INTERNAL}`);
      this.#initClient();
    }
  }

  #initBroker() {
    this.#server?.on('connection', (socket) => {
      logger.info(`broker socket.id: ${socket.id}`);
      socket.on('hello', (sender) => {
        logger.info(`hello from ${sender}`);
      });
    });

    this.#server?.listen(SOCKETIO_PORT_INTERNAL);
  }

  #initClient() {
    this.#client?.on('connect', () => {
      logger.info(`client socket.id: ${this.#client?.id}`);
    });
    this.#client?.emit('hello', HOST);
  }
}
