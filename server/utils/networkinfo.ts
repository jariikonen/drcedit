/* eslint-disable import/extensions */
import { networkInterfaces } from 'os';
import { NetworkInfo } from '../types.ts';

const interfaces = networkInterfaces();
const keys = Object.keys(interfaces);

export default function getNetworkInfo() {
  const results: NetworkInfo[] = [];
  keys.forEach((key) => {
    const net = interfaces[key];
    if (net) {
      net.forEach((netInfo) => {
        if (netInfo.family === 'IPv4' && !netInfo.address.includes('127')) {
          const addrSplit = netInfo.address.split('.');
          const addrParts = addrSplit.map((e) => parseInt(e, 10));
          const maskSplit = netInfo.netmask.split('.');
          const broadcast = addrParts
            // eslint-disable-next-line no-bitwise
            .map((e, i) => (~maskSplit[i] & 0xff) | e)
            .join('.');
          const result = { ...netInfo, broadcast, interface: key };
          results.push(result);
        }
      });
    }
  });
  return results;
}

export function getPriorityNumber(address: string, mask: string) {
  const addrSplit = address.split('.');
  const addrParts = addrSplit.map((e) => parseInt(e, 10));
  const maskSplit = mask.split('.');
  const priorityNumberStr = addrParts
    // eslint-disable-next-line no-bitwise
    .map((e, i) => (~maskSplit[i] & e).toString(2).padStart(8, '0'))
    .join('');
  return parseInt(priorityNumberStr, 2);
}

export function validAddress(str: string) {
  const m = str.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  return (
    m != null &&
    parseInt(m[1], 10) <= 255 &&
    parseInt(m[2], 10) <= 255 &&
    parseInt(m[3], 10) <= 255 &&
    parseInt(m[4], 10) <= 255
  );
}
