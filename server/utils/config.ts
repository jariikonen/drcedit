import getNetworkInfo, { getPriorityNumber } from './networkinfo';

export const NETWORK_INFO = getNetworkInfo()[0];
export const HOST = NETWORK_INFO.address;
export const HTTP_PORT = parseInt(`${process.env.PORT ?? 5173}`, 10);
export const SOCKETIO_PORT = parseInt(`${process.env.PORT ?? 1234}`, 10);
export const DISCOVERY_PORT = parseInt(
  `${process.env.DISCOVERY_PORT ?? 4321}`,
  10
);
export const PRIORITY = getPriorityNumber(HOST, NETWORK_INFO.netmask);
