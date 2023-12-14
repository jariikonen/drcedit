/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import logger from '../utils/logger';
// import Discovery from './Discovery.ts';
import { HOST } from '../utils/networkinfo';

const log = logger.child({ caller: 'LoadBalancing' });

export default class LoadBalancing extends EventEmitter {
  // #discovery: Discovery;

  #editingNodes: string[] = [];

  #editingIndex = 0;

  constructor() {
    super();
    // this.#discovery = discovery;
    this.#editingNodes = [HOST];
    log.info('load balancing service is running');
  }

  getContactNode(): string {
    const contactNode = this.#editingNodes[this.#editingIndex];
    log.debug(`returning contact node: ${contactNode}`);
    return contactNode;
  }
}
