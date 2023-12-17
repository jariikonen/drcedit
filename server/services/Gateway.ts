/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import { Server } from 'node:http';
import express, { Express, Router, Request } from 'express';
import logger from '../utils/logger';
import { GATEWAY_HTTP_PORT } from './config/config';
import { HOST } from '../utils/networkinfo';
import Storage from './Storage';
import Editing from './Editing';
import { Document, EditingServerData } from '../types';
import LoadBalancing from './LoadBalancing';

const log = logger.child({ caller: 'Gateway' });

export default class Gateway extends EventEmitter {
  #app: Express;

  #expressInstance: Server;

  #storage: Storage;

  #editing: Editing;

  #loadBalancer: LoadBalancing;

  #documentRouter: Router;

  constructor(storage: Storage, editing: Editing, loadBalancer: LoadBalancing) {
    super();
    this.#storage = storage;
    this.#editing = editing;
    this.#loadBalancer = loadBalancer;

    this.#app = express();

    this.#app.use(express.static('dist'));

    this.#app.use(express.json());
    this.#documentRouter = this.#initializeDocumentRouter();
    this.#app.use('/api/documents', this.#documentRouter);

    this.#expressInstance = this.#app.listen(GATEWAY_HTTP_PORT, HOST, () =>
      log.info(`express server running on ${HOST}:${GATEWAY_HTTP_PORT}`)
    );
  }

  #initializeDocumentRouter(): Router {
    const router = express.Router();

    router.get('/', (req, res) => {
      log.debug(
        req,
        'received a request for all documents (get /api/documents)'
      );
      this.#storage
        .getDocuments()
        .then((documents) => {
          const allWithoutDocumentState = documents.map((doc) => {
            const { content, ...rest } = doc;
            return rest;
          });
          log.info(allWithoutDocumentState, 'sending all documents');
          res.send(allWithoutDocumentState);
        })
        .catch((error) => {
          if (error instanceof Error) log.error(error.stack);
          else log.error(error);
        });
    });

    interface CreateRequest extends Request {
      body: {
        documentName: string;
      };
    }

    router.post('/', (req: CreateRequest, res) => {
      if (!req.body.documentName) {
        throw new Error('invalid request - no document name');
      }
      log.debug(
        req.body,
        `received a request to create a new document with name '${req.body.documentName}'`
      );
      this.#storage
        .createDocument(req.body.documentName)
        .then((document) => {
          log.info(
            document,
            'created a new document - responding with the new document object'
          );
          res.send(this.#getEditingNode(document));
        })
        .catch((error) => {
          if (error instanceof Error) log.error(error.stack);
          else log.error(error);
        });
    });

    interface EditRequest extends Request {
      params: {
        id: string;
      };
    }

    router.get('/edit/:id', (req: EditRequest, res) => {
      const { id } = req.params;
      log.debug(
        req,
        `received a request to edit document '${id}' (get /api/documents/${id})`
      );
      this.#storage
        .getDocument(id)
        .then((document) => {
          if (!document) {
            res.status(404);
            res.send('document not found');
            return;
          }
          const serverData = this.#getEditingNode(document);
          log.info(serverData, 'sending editing server data');
          res.send(serverData);
        })
        .catch((error) => {
          if (error instanceof Error) log.error(error.stack);
          else log.error(error);
        });
    });

    return router;
  }

  #getEditingNode(document: Document): EditingServerData {
    const contactNode = this.#editing.getContactNode(document);
    if (contactNode) {
      return {
        contactNode,
        documentID: document.documentID,
        documentName: document.documentName,
      };
    }
    const editingNodesData = this.#loadBalancer.getEditingNodes();
    return {
      contactNode: editingNodesData.clientContactNode,
      documentID: document.documentID,
      documentName: document.documentName,
    };
  }

  close() {
    log.info('closing the gateway server');
    return new Promise((resolve, reject) => {
      this.#expressInstance.close((error) => {
        if (error) {
          reject(error);
        }
        resolve('gateway server has closed');
      });
    });
  }
}
