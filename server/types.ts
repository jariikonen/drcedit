import * as Y from 'yjs';
import { NetworkInterfaceInfoIPv4 } from 'os';

export interface DocumentRegistration {
  name: string;
  users: [string];
  document: Y.Doc;
}

export interface NetworkInfo extends NetworkInterfaceInfoIPv4 {
  broadcast: string;
  interface: string;
}

export interface NodeInfo {
  address: string;
  priority: number;
}

export type NodeList = string[];
