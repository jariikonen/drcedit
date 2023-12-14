/* eslint-disable import/extensions */

import logger from './utils/logger.ts';
import { HOST } from './utils/networkinfo.ts';
import Discovery from './services/Discovery.ts';
import Messaging from './services/Messaging.ts';
import Storage from './services/Storage.ts';
import Gateway from './services/Gateway.ts';
import { NodeInfo } from './types.ts';
import Editing from './services/Editing.ts';
import LoadBalancing from './services/LoadBalancing.ts';

const log = logger.child({ caller: 'server' });

let messaging: Messaging | null = null;

const discovery = new Discovery();

discovery.on('newNodes', (newNodes: NodeInfo[]) => {
  log.info(`NEW NODES EVENT: ${JSON.stringify(newNodes)}`);
});

discovery.on('newRoles', (newNodes: NodeInfo[], source: string) => {
  log.info(`NEW ROLES EVENT (${source}): ${JSON.stringify(newNodes)}`);

  const roles = newNodes.find((node) => node.address === HOST)?.roles;
  log.info(`assuming new role(s): ${JSON.stringify(roles)}`);

  // close previously opened Messaging instance (if exists)
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

// start discovery server
// discovery.bind(DISCOVERY_PORT);

// eslint-disable-next-line no-new
const storage = new Storage();
/* storage
  .getFiles()
  .then((files) => {
    log.info(
      files,
      `typeof: ${typeof files}, isArray: ${Array.isArray(files)}`
    );
  })
  .catch((error: Error) => log.error(error.stack)); */

const loadBalancer = new LoadBalancing();
const editing = new Editing(HOST, storage, loadBalancer);

// eslint-disable-next-line no-new
new Gateway(storage, editing);
