// Extended from y-socket.io/src/server/server.ts
/* eslint-disable import/extensions */

import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'node:events';
// import * as Y from 'yjs';
import logger from '../utils/logger.ts';
import { DocumentRegistration } from '../types.ts';
import { SOCKETIO_PORT, HOST } from '../utils/config.ts';
import Storage from './Storage.ts';

const log = logger.child({ caller: 'Editing' });

interface ServerResponse {
  code: number;
  message: string;
}

export default class Editing extends EventEmitter {
  static OK: 1000;

  static NOFILE = 1001;

  #ioServer: Server;

  #storage: Storage;

  #documents: Record<string, DocumentRegistration> = {};

  constructor(gatewayAddress: string, storage: Storage) {
    super();
    this.#ioServer = new Server({
      cors: {
        origin: `http://${gatewayAddress}:${SOCKETIO_PORT}`,
      },
    });
    this.#storage = storage;
    console.log(this.#storage);
    this.#initializeIoServer();
  }

  #initializeIoServer() {
    this.#ioServer.on('connection', async (socket: Socket) => {
      log.info(`Connected with user: ${socket.id}`);

      await socket.join(socket.id);

      socket.on(
        'register',
        async (
          filename: string,
          callback: (response: ServerResponse) => ServerResponse
        ) => {
          log.info(
            `client ${socket.id} requesting registration to edit document '${filename}'`
          );
          if (!(filename in this.#documents)) {
            log.info(`responding to ${socket.id}: no such file`);
            callback({
              code: Editing.NOFILE,
              message: `no such file ${filename}`,
            });
            return;
          }
          // register client and add the socket to a document specific room
          this.#documents[filename].clients.push(socket.id);
          await socket.join(filename);
          log.info(`responding to ${socket.id}: OK`);

          callback({
            code: Editing.OK,
            message: 'OK',
          });
        }
      );

      /* socket.on('update', (update: Uint8Array, editor: number) => {
        log.info('update', update, editor);
        socket.emit('testi2');
        const normal = this.#io.of('/');
        normal.to(socket.id).emit('hello', 'toinen');
      }); */

      // socket.on('update', (update: Uint8Array, editor: number) => {
      // Y.applyUpdate(ydoc, update);
      // console.log('socket', editor);
      // console.log('ydoc.getText().toJSON()', ydoc.getText().toJSON());
      // });

      socket.on('disconnect', () => {
        logger.info(`[disconnect] Disconnected with user: ${socket.id}`);
      });
    });

    this.#ioServer.listen(SOCKETIO_PORT);
    log.info(`editing server listening on ${HOST}:${SOCKETIO_PORT}`);
  }
}
