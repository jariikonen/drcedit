// Extended from y-socket.io/src/server/server.ts
/* eslint-disable import/extensions */

import http from 'http';
import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'node:events';
import * as Y from 'yjs';
import logger from '../utils/logger.ts';
import { DocumentRegistration } from '../types.ts';

export default class Editing extends EventEmitter {
  #server: http.Server;

  #io: Server;

  #host: string;

  #httpPort: number;

  #socketIOPort;

  #documentRegister: Record<string, DocumentRegistration> = {};

  constructor(host: string, httpPort: number, socketIOPort: number) {
    super();
    this.#host = host;
    this.#httpPort = httpPort;
    this.#socketIOPort = socketIOPort;
    this.#server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    this.#io = new Server(this.#server, {
      cors: {
        origin: `http://${this.#host}:${this.#httpPort}`,
      },
    });

    this.#io.on('connection', async (socket: Socket) => {
      logger.info(`[connection] Connected with user: ${socket.id}`);

      await socket.join(socket.id);

      socket.on(
        'register',
        (documentID: string, documentName: string, clientName: string) => {
          if (!(documentID in this.#documentRegister)) {
            this.#documentRegister[documentID] = {
              name: documentName,
              users: [clientName],
              document: new Y.Doc(),
            };
          }
          logger.info(this.#documentRegister);
          setTimeout(() => {
            logger.info(socket.id);
            this.#io.of('/').to(socket.id).emit('hi');
            socket.emit('testi1');
          }, 3000);
        }
      );

      socket.on('update', (update: Uint8Array, editor: number) => {
        logger.info('update', update, editor);
        socket.emit('testi2');
        const normal = this.#io.of('/');
        normal.to(socket.id).emit('hello', 'toinen');
      });

      // socket.on('update', (update: Uint8Array, editor: number) => {
      // Y.applyUpdate(ydoc, update);
      // console.log('socket', editor);
      // console.log('ydoc.getText().toJSON()', ydoc.getText().toJSON());
      // });

      socket.on('disconnect', () => {
        logger.info(`[disconnect] Disconnected with user: ${socket.id}`);
      });
    });
  }

  listen() {
    this.#server.listen(this.#socketIOPort, this.#host, undefined, () =>
      logger.info(`server running on ${this.#host}:${this.#socketIOPort}`)
    );
  }
}
