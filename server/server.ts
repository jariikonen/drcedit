/* eslint-disable import/extensions */

import logger from './utils/logger.ts';
import { HOST } from './utils/networkinfo.ts';
import Discovery from './services/Discovery.ts';
import Messaging from './services/Messaging.ts';
import Storage from './services/Storage.ts';
import Gateway from './services/Gateway.ts';
import { NodeInfo, Role } from './types.ts';
import Editing from './services/Editing.ts';
import LoadBalancing from './services/LoadBalancing.ts';
import { DISCOVERY_PORT } from './utils/config.ts';

const log = logger.child({ caller: 'server' });

let messaging: Messaging | null = null;
let messageBrokerAddress: string | null = null;
let gateway: Gateway | null = null;
let editing: Editing | null = null;
let loadBalancer: LoadBalancing | null = null;
let storage: Storage | null = null;

let currentRoles: Role[] = [];

const discovery = new Discovery();

function closeServices() {
  if (messaging) {
    messaging.close();
    messaging = null;
  }
  if (gateway) {
    gateway.close();
    gateway = null;
  }
  if (editing) {
    editing.close();
    editing = null;
  }
  loadBalancer = null;
  storage = null;
}

function startServices(
  brokerNode: NodeInfo | undefined,
  gatewayAddress: string | undefined
) {
  // start a new Messaging as a broker or a client
  if (brokerNode?.address === HOST) {
    messaging = new Messaging(true);
  } else if (brokerNode) {
    messaging = new Messaging(false, messageBrokerAddress);
  }

  // and other services too
  storage = new Storage(messaging);

  if (gatewayAddress) {
    editing = new Editing(gatewayAddress, storage, messaging);
    if (gatewayAddress === HOST) {
      loadBalancer = new LoadBalancing(discovery);
      gateway = new Gateway(storage, editing, loadBalancer);
    }
  }
}

discovery.on('nodes', (newNodes: NodeInfo[]) => {
  log.info(`nodes event:\n\t${JSON.stringify(newNodes)}`);
});

discovery.on('roles', (newNodes: NodeInfo[], source: string) => {
  log.info(`roles event (${source}):\n\t${JSON.stringify(newNodes)}`);

  const roles = newNodes.find((node) => node.address === HOST)?.roles;
  if (!roles) throw new Error('no roles - this should not happen');
  if (roles !== currentRoles) {
    log.info(`assuming new role(s): ${JSON.stringify(roles)}`);
    closeServices();
    currentRoles = roles;
    const brokerNode = newNodes.find((node) =>
      node.roles.includes('MESSAGE_BROKER')
    );
    messageBrokerAddress = brokerNode ? brokerNode.address : null;
    const gatewayAddress = roles.includes('GATEWAY')
      ? HOST
      : newNodes.find((node) => node.roles.includes('GATEWAY'))?.address;
    startServices(brokerNode, gatewayAddress);
  }
});

// start discovery server
discovery.bind(DISCOVERY_PORT);
