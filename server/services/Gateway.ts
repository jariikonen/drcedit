/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import express, { Express, Router, Request } from 'express';
import logger from '../utils/logger';
import { HOST, GATEWAY_HTTP_PORT } from '../utils/config';
import Storage from './Storage';

const log = logger.child({ caller: 'Gateway' });

export default class Gateway extends EventEmitter {
  #app: Express;

  #storage: Storage;

  #fileRouter: Router;

  constructor(storage: Storage) {
    super();
    this.#storage = storage;
    this.#app = express();

    this.#app.use(express.static('dist'));

    this.#app.use(express.json());
    this.#fileRouter = this.#initializeFileRouter();
    this.#app.use('/api/files', this.#fileRouter);

    this.#app.listen(GATEWAY_HTTP_PORT, HOST, () =>
      log.info(`express server running on ${HOST}:${GATEWAY_HTTP_PORT}`)
    );
  }

  #initializeFileRouter(): Router {
    const router = express.Router();

    router.get('/', (req, res) => {
      log.debug(req, 'received a request for all files (get /api/files)');
      this.#storage
        .getFiles()
        .then((files) => {
          log.info(files, 'sending all files');
          res.send(files);
        })
        .catch((error) => {
          if (error instanceof Error) log.error(error.stack);
          else log.error(error);
        });
    });

    interface CreateRequest extends Request {
      body: {
        filename: string;
      };
    }

    router.post('/', (req: CreateRequest, res) => {
      if (!req.body.filename) {
        throw new Error('invalid request - no filename');
      }
      log.debug(
        req.body,
        `received a request to create a new file with name '${req.body.filename}'`
      );
      this.#storage
        .createFile(req.body.filename)
        .then((file) => {
          log.info(
            file,
            'created a new file - responding with the new file object'
          );
          res.send(file);
        })
        .catch((error) => {
          if (error instanceof Error) log.error(error.stack);
          else log.error(error);
        });
    });

    return router;
  }
}
