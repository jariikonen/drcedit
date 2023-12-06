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
import Messaging from './roles/messaging.ts';
import { NodeInfo } from './types.ts';

const role: string | null = null;
let editing: Editing | null = null;
let messaging: Messaging | null = null;

const discovery = new Discovery();
discovery.on('newNodes', (newNodes: NodeInfo[]) => {
  logger.info(`NEW NODES EVENT: ${JSON.stringify(newNodes)}`);
});

discovery.on('newRoles', (newNodes: NodeInfo[], source: string) => {
  logger.info(`NEW ROLES EVENT (${source}): ${JSON.stringify(newNodes)}`);

  const roles = newNodes.find((node) => node.address === HOST)?.roles;
  logger.info(`assuming new role(s): ${JSON.stringify(roles)}`);

  // close previously opened Messaging instance
  if (messaging) {
    messaging.close();
  }

  // and start a new one as a broker or a client
  if (roles?.includes('MESSAGE_BROKER')) {
    messaging = new Messaging(true);
  } else {
    const brokerNode = newNodes.find((node) =>
      node.roles.includes('MESSAGE_BROKER')
    );
    messaging = new Messaging(false, brokerNode?.address);
    messaging.join('testiHuone');
    messaging.sendToRoom(
      'testiHuone',
      'testiViesti',
      `testiviesti ${HOST}:ilta`
    );
  }
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
