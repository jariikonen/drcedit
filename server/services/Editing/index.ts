// Extended from y-socket.io/src/server/server.ts
/* eslint-disable import/extensions */

import { Server, Socket } from 'socket.io';
import { EventEmitter } from 'node:events';
import * as Y from 'yjs';
import logger from '../../utils/logger.ts';
import {
  DocumentRegistration,
  Document,
  EditingNodesData,
} from '../../types.ts';
import { GATEWAY_HTTP_PORT, SOCKETIO_PORT } from '../../utils/config.ts';
import { HOST } from '../../utils/networkinfo.ts';
import Storage from '../Storage.ts';
import Messaging from '../Messaging.ts';
import Consensus from './Consensus.ts';
import Discovery from '../Discovery.ts';

const log = logger.child({ caller: 'Editing' });

export interface ServerResponse {
  code: number;
  message: string;
  documentContent?: Uint8Array;
}

/**
 * Editing service handles updating of the document states in a distributed
 * fashion. In each instance the document state is held in a Yjs CRDT datatype
 * Y.Doc, and the updates to the state are commutative, associative, and
 * idempotent. This means that they can be applied in any order, and multiple
 * times. All clients will sync up when they have received all of the updates.
 * (https://docs.yjs.dev/api/document-updates)
 *
 * Editing service ensures that all instances of the service receive all of
 * the updates by using the RAFT consensus algorithm, which is implemented in
 * it's own module (see RAFT.ts). It communicates with the other instances by
 * sending messages through the Messaging service (see Messaging.ts). When the
 * service is started it joins into a room (Socket.io communication channel)
 * 'editing', which enables broadcasting messages to all service instances in
 * the room. After that it starts the leader election. Nodes (different service
 * instances) turn themselves into candidates after a randomized period of time
 * and send a message requesting for votes to be selected as the leader. When a
 * node receives a vote request, it responds with OK if it hasn't given it's
 * vote already, and if
 *
 */
export default class Editing extends EventEmitter {
  /** Response code - request succeeded. */
  static OK: 1000;

  /** Response code - a file related to the request is missing. */
  static NOFILE = 1001;

  /** Response code - internal server error. */
  static SRVERR = 1002;

  /** Socket.io server for communicating with the client. */
  #ioServer: Server;

  /** Local Storage service instance. */
  #storage: Storage;

  /** Local Messaging service instance. */
  #messaging: Messaging | null = null;

  #consensus: Consensus | null = null;

  /**
   * Register of documents under editing. Contains data about the documents,
   * including the Y.Doc object containing the document state.
   */
  #documents: Record<string, DocumentRegistration> = {};

  constructor(
    gatewayAddress: string,
    storage: Storage,
    messaging: Messaging | null,
    discovery: Discovery
  ) {
    super();
    this.#ioServer = new Server({
      cors: {
        origin: `http://${gatewayAddress}:${GATEWAY_HTTP_PORT}`,
      },
    });
    this.#storage = storage;
    this.#messaging = messaging;
    if (this.#messaging) {
      this.#initializeMessaging();
      this.#initializeIoServer();
      this.#consensus = new Consensus(messaging, discovery);
      log.debug(this.#consensus); // JUST TO SUPPRESS ESLINT - REMOVE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    }
  }

  #initializeMessaging() {
    const msging = this.#messaging;
    if (!msging) throw new Error('no messaging service');
    if (!msging.isBroker()) msging.join('editing');

    msging.on('editing', (subEvent: string, ...args: unknown[]) => {
      log.info(
        `received an editing message with sub-event '${subEvent}':\n\t'${JSON.stringify(
          args
        )}'`
      );
    });
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

      socket.on('disconnect', () => {
        logger.info(`[disconnect] Disconnected with user: ${socket.id}`);
      });
    });

    this.#ioServer.listen(SOCKETIO_PORT);
    log.info(`editing server listening on ${HOST}:${SOCKETIO_PORT}`);
  }

  getContactNode(document: Document): string | null {
    return document.documentID in this.#documents
      ? this.#documents[document.documentID].clientContactNode
      : null;
  }

  assignNodes(document: Document, nodes: EditingNodesData) {
    if (document.documentID in this.#documents)
      throw new Error(
        'nodes already assigned for document - use getContactNode() instead'
      );
    log.info(
      `assigning editing nodes for document '${
        document.documentID
      }': ${JSON.stringify(nodes)} - FINISH THIS METHOD!!!!!!!!!!!!!!!!!!!!`
    );
    if (!(document.documentID in this.#documents)) {
      this.#documents[document.documentID] = {
        document,
        clientContactNode: HOST,
        nodes: [HOST],
        clients: [],
      };
    }
  }

  close() {
    log.info('closing editing server');
    return new Promise((resolve, reject) => {
      this.#ioServer.close((error) => {
        if (error) reject(error);
        resolve('editing server has closed');
      });
    });
  }
}
