/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import express, { Express } from 'express';
import logger from '../utils/logger';
import { HOST, GATEWAY_HTTP_PORT } from '../utils/config';

const log = logger.child({ caller: 'Storage' });

export default class Gateway extends EventEmitter {
  #app: Express;

  constructor() {
    super();
    this.#app = express();
    this.#app.use(express.static('dist'));
    this.#app.listen(GATEWAY_HTTP_PORT, HOST, () =>
      log.info(`express server running on ${HOST}:${GATEWAY_HTTP_PORT}`)
    );
  }
}
