// Extended from y-socket.io/src/server/server.ts
/* eslint-disable import/extensions */

import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'node:events';
// import * as Y from 'yjs';
import logger from '../utils/logger.ts';
import { DocumentRegistration, EditingServerData, Document } from '../types.ts';
import { SOCKETIO_PORT, HOST } from '../utils/config.ts';
import Storage from './Storage.ts';
import LoadBalancing from './LoadBalancing.ts';

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

  #loadBalancer: LoadBalancing;

  #documents: Record<string, DocumentRegistration> = {};

  constructor(
    gatewayAddress: string,
    storage: Storage,
    loadBalancer: LoadBalancing
  ) {
    super();
    this.#ioServer = new Server({
      cors: {
        origin: `http://${gatewayAddress}:${SOCKETIO_PORT}`,
      },
    });
    this.#storage = storage;
    this.#loadBalancer = loadBalancer;
    log.debug(this.#storage); // TO SUPPRESS ESLINT ERROR - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    log.debug(this.#loadBalancer); // TO SUPPRESS ESLINT ERROR - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    this.#initializeIoServer();
  }

  #initializeIoServer() {
    this.#ioServer.on('connection', async (socket: Socket) => {
      log.info(`Connected with user: ${socket.id}`);

      await socket.join(socket.id);

      socket.on(
        'register',
        async (
          documentID: string,
          callback: (response: ServerResponse) => ServerResponse
        ) => {
          log.info(
            `client ${socket.id} requesting registration to edit document '${documentID}'`
          );
          if (!(documentID in this.#documents)) {
            log.info(`responding to ${socket.id}: no such file`);
            callback({
              code: Editing.NOFILE,
              message: `no such file '${documentID}' (documentID)`,
            });
            return;
          }
          // register client and add the socket to a document specific room
          this.#documents[documentID].clients.push(socket.id);
          await socket.join(documentID);
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

  getEditingNode(document: Document): EditingServerData {
    if (!(document.documentID in this.#documents)) {
      this.#assignNodes(document);
    }
    const docRegistration = this.#documents[document.documentID];
    return {
      contactNode: docRegistration.clientContactNode,
      documentID: docRegistration.document.documentID,
      documentName: docRegistration.document.documentName,
    };
  }

  #assignNodes(document: Document) {
    log.info(
      `assigning editing nodes for document '${document.documentID}' (not fully implemented yet)`
    );
    this.#documents[document.documentID] = {
      document,
      clientContactNode: HOST,
      nodes: [HOST],
      clients: [],
    };
  }
}
