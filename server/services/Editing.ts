// Extended from y-socket.io/src/server/server.ts
/* eslint-disable import/extensions */

import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'node:events';
import * as Y from 'yjs';
import logger from '../utils/logger.ts';
import { DocumentRegistration, EditingServerData, Document } from '../types.ts';
import { GATEWAY_HTTP_PORT, SOCKETIO_PORT } from '../utils/config.ts';
import { HOST } from '../utils/networkinfo.ts';
import Storage from './Storage.ts';
import LoadBalancing from './LoadBalancing.ts';

const log = logger.child({ caller: 'Editing' });

export interface ServerResponse {
  code: number;
  message: string;
  documentContent?: Uint8Array;
}

export default class Editing extends EventEmitter {
  static OK: 1000;

  static NOFILE = 1001;

  static SRVERR = 1002;

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
        origin: `http://${gatewayAddress}:${GATEWAY_HTTP_PORT}`,
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
      log.info(`connected with user: ${socket.id}`);

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

          // get document from storage and register it
          const document = await this.#storage.getDocument(documentID);
          if (!document) {
            callback({
              code: Editing.SRVERR,
              message: `SERVER ERROR: no such file '${documentID}'`,
            });
            throw new Error(
              `did not receive document '${documentID}' - this should not happen`
            );
          }
          if (!document.content) document.content = new Y.Doc();
          this.#documents[documentID].document = document;

          // register the client to the document's record and join to a
          // document-specific room on the messaging server
          this.#documents[documentID].clients.push({ socket });
          // await messaging.join(documentID);

          // return OK with the initial document state
          const update = Y.encodeStateAsUpdate(document.content);
          log.info(`responding to ${socket.id}: OK`);
          log.debug(update, 'OK response includes this initial update');
          callback({
            code: Editing.OK,
            message: 'OK',
            documentContent: update,
          });
        }
      );

      socket.on(
        'update',
        (
          update: Uint8Array,
          count: string,
          clientID: number,
          documentID: string
        ) => {
          log.info(
            `received update '${count}' to document '${documentID}' from client '${clientID}'`
          );

          // apply the update to the state of this particular document
          const documentState = this.#documents[documentID].document.content;
          if (!documentState) {
            throw new Error(
              'SERVER ERROR: no document state - this should not happen'
            );
          }
          Y.applyUpdate(
            documentState,
            new Uint8Array(update),
            `${clientID}:${count}`
          );
          log.info(
            `current document state: ${documentState.getText().toJSON()}`
          );

          // send the update to the other clients editing this document
          const otherClients = this.#documents[documentID].clients.filter(
            (c) => c.socket.id !== socket.id
          );
          otherClients.forEach((c) =>
            c.socket.emit('update', update, count, clientID, documentID)
          );
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
