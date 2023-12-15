/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import { Server, Socket as ServerSocket } from 'socket.io';
import { io, Socket } from 'socket.io-client';
import { SOCKETIO_PORT_INTERNAL } from '../utils/config';
import { HOST } from '../utils/networkinfo';
import logger from '../utils/logger';

const log = logger.child({ caller: 'Messaging' });

export default class Messaging extends EventEmitter {
  #server: Server | null = null;

  #client: Socket | null = null;

  #broker: boolean;

  constructor(broker: boolean, brokerAddress: string | null = null) {
    super();

    this.#broker = broker;

    // Messaging instance functions either as a Socket.io server
    if (broker) {
      log.info('starting a new message broker');
      this.#server = new Server();
      this.#initBroker();
    }
    // ... or a Socket.io client
    else {
      if (!brokerAddress) {
        throw new Error(
          'if Messaging instance is not a broker a brokerAddress parameter must be set'
        );
      }
      log.info('starting a new messaging client');
      const brokerUrl = `ws://${brokerAddress}:${SOCKETIO_PORT_INTERNAL}`;
      log.info(
        `new messaging client is connecting to message broker (${brokerUrl})`
      );
      this.#client = io(brokerUrl, {
        auth: {
          host: HOST,
        },
      });
      this.#initClient();
    }
  }

  #initBroker() {
    this.#server?.on('connection', async (socket) => {
      // add the new socket to a room named after the remote host address =>
      // messages can be passed to this socket by emitting them to this room
      const remoteHostAddress = Messaging.#getRemoteHostFromHandshake(socket);
      await socket.join(remoteHostAddress);

      log.info(
        `broker connected to ${remoteHostAddress} (socket: ${socket.id})`
      );

      // clients can join rooms by sending messages as 'join' events and
      // passing the room name as parameter
      socket.on('join', async (room: string) => {
        await socket.join(room);
        log.info(
          `added ${remoteHostAddress} (socket: ${socket.id}) to room ${room}`
        );
      });

      // clients can send messages to specific rooms by sending them as
      // 'toRoom' events
      socket.on('toRoom', (room: string, event: string, ...args: unknown[]) => {
        log.debug(
          `passing a message as '${event}' event to room '${room}':\n\t'${JSON.stringify(
            args
          )}'`
        );
        socket.to(room).emit(event, ...args);
        if (room === 'editing') this.emit('editing', ...args);
      });

      socket.onAny((event, ...args) => {
        log.debug(
          `received a message (${event}):\n\t${JSON.stringify(
            args
          )}\n\t(broker: ${JSON.stringify(this.#broker)})`
        );
      });

      socket.on('disconnect', (reason) => {
        log.info(`socket ${socket.id} disconnected (${reason})`);
      });
    });

    this.#server?.listen(SOCKETIO_PORT_INTERNAL);
  }

  static #getRemoteHostFromHandshake(socket: ServerSocket): string {
    if (!socket.handshake.auth.host) {
      throw new Error(
        'no socket.handshake.auth.host - clients must send their address in auth credentials when connecting'
      );
    }
    if (typeof socket.handshake.auth.host !== 'string') {
      throw new Error(
        `socket.handshake.auth.host is ${typeof socket.handshake.auth
          .host} instead of a string`
      );
    }
    return socket.handshake.auth.host;
  }

  #initClient() {
    if (!this.#client) {
      throw new Error(
        '#initClient can be called only on a Messaging instance that is acting as a client'
      );
    }
    this.#client.on('connect', () => {
      log.info(`client connected (socket: ${this.#client?.id})`);
    });

    this.#client.onAny((event, ...args) => {
      log.debug(`received a message (${event}):\n\t${JSON.stringify(args)}`);
    });

    this.#client.on('editing', (...args: unknown[]) => {
      log.debug(
        `received an editing message:\n\t${JSON.stringify(
          args
        )}\n\temitting as an editing event`
      );
      this.emit('editing', ...args);
    });

    this.#client.on('disconnection', (reason) => {
      log.info(`client ${this.#client?.id} disconnected (${reason})`);
    });
  }

  join(room: string) {
    if (!this.#client) {
      throw new Error(
        'join can be called only on a Messaging instance that is acting as a client'
      );
    }
    this.#client.emit('join', room);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(event: string, ...args: unknown[]) {
    const instance = this.#client ? this.#client : this.#server;
    if (!instance) {
      throw new Error('no Messaging instance');
    }
    log.debug(
      `sending message as '${event}' event:\n\t'${JSON.stringify(args)}'`
    );
    instance.emit(event, ...args);
  }

  sendToRoom(room: string, event: string, ...args: unknown[]) {
    if (this.#client) {
      log.debug(
        `client sending message as '${event}' event to room '${room}':\n\t'${JSON.stringify(
          args
        )}'`
      );
      this.#client.emit('toRoom', room, event, ...args);
      return;
    }
    if (this.#server) {
      log.debug(
        `broker sending message as '${event}' event to room '${room}':\n\t'${JSON.stringify(
          args
        )}`
      );
      this.#server.to(room).emit(event, ...args);
      return;
    }
    throw new Error('no Messaging instance');
  }

  close() {
    if (this.#server) {
      log.info('closing the messaging server');
    }
    if (this.#client) {
      const clientSocketId = this.#client.id;
      this.#client?.disconnect();
      log.info(`closing the messaging client (socket ${clientSocketId})`);
    }
    return new Promise((resolve, reject) => {
      if (this.#server) {
        this.#server?.close((error) => {
          if (error) reject(error);
          resolve('messaging server has closed');
        });
      }
      if (this.#client) {
        resolve('messaging client has closed');
      }
    });
  }

  isBroker() {
    return this.#broker;
  }
}
