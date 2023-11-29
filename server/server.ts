/* eslint-disable import/extensions */

import logger from './utils/logger.ts';
import {
  DISCOVERY_PORT,
  HOST,
  HTTP_PORT,
  SOCKETIO_PORT,
} from './utils/config.ts';
import Discovery from './roles/discovery.ts';
import Editing from './roles/editing.ts';
import { NodeInfo } from './types.ts';

let nodes: NodeInfo[] = [];
const role: string | null = null;
let editing: Editing | null = null;

const discovery = new Discovery();
discovery.on('nodes', (newNodes: NodeInfo[]) => {
  nodes = [...newNodes];
  logger.info(`NODES EVENT ${JSON.stringify(nodes)}`);
});
discovery.bind(DISCOVERY_PORT);

if (role) {
  switch (role) {
    case 'EDITING':
      editing = new Editing(HOST, HTTP_PORT, SOCKETIO_PORT);
      editing.listen();
      break;
    default:
      logger.error('unknown role');
  }
}
