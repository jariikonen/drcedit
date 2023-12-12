import * as Y from 'yjs';
import { NetworkInterfaceInfoIPv4 } from 'os';

export interface UserRegistration {
  username: string;
  client: string;
}

export interface DocumentRegistration {
  filename: string;
  users: UserRegistration[];
  content: Y.Doc | null;
}

export interface NetworkInfo extends NetworkInterfaceInfoIPv4 {
  broadcast: string;
  interface: string;
}

export type Role = 'MESSAGE_BROKER' | 'GATEWAY' | 'EDITING';

export interface CoordinatorMsgNodeInfo {
  address: string;
  roles: Role[];
}

export function isRole(role: unknown): role is Role {
  return role === 'MESSAGE_BROKER' || role === 'GATEWAY' || role === 'EDITING';
}

export function isCoordinatorMsgNodeInfo(
  nodeInfo: unknown
): nodeInfo is CoordinatorMsgNodeInfo {
  const typecast = nodeInfo as CoordinatorMsgNodeInfo;
  return (
    typecast.address !== undefined &&
    typecast.roles !== undefined &&
    typeof typecast.address === 'string' &&
    Array.isArray(typecast.roles) &&
    typecast.roles.every((r) => isRole(r))
  );
}

export interface NodeInfo extends CoordinatorMsgNodeInfo {
  priority: number;
}

export type NodeList = string[];

export interface File {
  filename: string;
  content: Y.Doc | null;
}

export function isFile(obj: unknown): obj is File {
  return (
    (obj as File).filename !== undefined &&
    (obj as File).content !== undefined &&
    ((obj as File).content === null || (obj as File).content instanceof Y.Doc)
  );
}
