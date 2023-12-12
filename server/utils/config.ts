import getNetworkInfo, { getPriorityNumber } from './networkinfo';

export const NETWORK_INFO = getNetworkInfo()[0];
export const HOST = NETWORK_INFO.address;
export const HTTP_PORT = parseInt(`${process.env.PORT ?? 5173}`, 10);
export const SOCKETIO_PORT = parseInt(`${process.env.PORT ?? 1234}`, 10);
export const SOCKETIO_PORT_INTERNAL = parseInt(
  `${process.env.PORT ?? 1122}`,
  10
);
export const DISCOVERY_PORT = parseInt(
  `${process.env.DISCOVERY_PORT ?? 4321}`,
  10
);
export const DISCOVERY_MESSAGE_INTERVAL = parseInt(
  `${process.env.DISCOVERY_MESSAGE_INTERVAL ?? 100}`,
  10
);
export const DISCOVERY_MESSAGE_TIMEOUT = parseInt(
  `${process.env.DISCOVERY_MESSAGE_TIMEOUT ?? 550}`,
  10
);
export const DISCOVERY_PREELECTION_TIMEOUT = parseInt(
  `${process.env.DISCOVERY_PREELECTION_TIMEOUT ?? 550}`,
  10
);
export const PRIORITY = getPriorityNumber(HOST, NETWORK_INFO.netmask);
export const STORAGE_DIR = process.env.STORAGE_DIR ?? 'storage';
export const STORAGE_DOCUMENTS_PATH =
  process.env.STORAGE_DOCUMENTS_PATH ?? 'storage/documents.json';
export const GATEWAY_HTTP_PORT = parseInt(
  `${process.env.GATEWAY_HTTP_PORT ?? 8080}`,
  10
);
