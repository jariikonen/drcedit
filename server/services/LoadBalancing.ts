/* eslint-disable import/extensions */
import { EventEmitter } from 'node:events';
import logger from '../utils/logger';
import Discovery from './Discovery';
import { HOST } from '../utils/networkinfo';
import { EditingNodesData, NodeInfo } from '../types';
import { EDITING_NUM_OF_NODES } from '../utils/config';

const log = logger.child({ caller: 'LoadBalancing' });

export default class LoadBalancing extends EventEmitter {
  #discovery: Discovery;

  #nodes: string[] = [];

  #editingIndex = 0;

  constructor(discovery: Discovery) {
    super();
    this.#discovery = discovery;
    this.#nodes = [HOST];
    this.#addDiscoveryListeners();
    log.info('load balancing service is running');
  }

  #addDiscoveryListeners() {
    this.#discovery.on('nodes', (nodes: NodeInfo[]) => {
      this.#nodes = nodes.map((node) => node.address);
    });
  }

  getEditingNodes(): EditingNodesData {
    const contactNode = this.#nodes[this.#editingIndex];
    let startNode = this.#editingIndex;
    const nodes = Array.from({ length: EDITING_NUM_OF_NODES }, (_x, i) => {
      if (startNode + i >= this.#nodes.length) startNode = 0;
      return this.#nodes[startNode + i];
    });
    const editingNodes: EditingNodesData = {
      clientContactNode: contactNode,
      editingNodes: nodes,
    };
    log.debug(`returning editing nodes: ${JSON.stringify(editingNodes)}`);
    return editingNodes;
  }
}
