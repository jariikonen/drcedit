import * as Y from 'yjs';
import { NetworkInterfaceInfoIPv4 } from 'os';

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

export interface Document {
  /** Unique identification number of the document. */
  documentID: string;

  /** Name of the document. */
  documentName: string;

  /** Object holding the document contents. */
  content: Y.Doc | null;
}

/** Type guard for the Document type. */
export function isDocument(obj: unknown): obj is Document {
  return (
    (obj as Document).documentID !== undefined &&
    typeof (obj as Document).documentID === 'string' &&
    (obj as Document).documentName !== undefined &&
    typeof (obj as Document).documentName === 'string' &&
    (obj as Document).content !== undefined &&
    ((obj as Document).content === null ||
      (obj as Document).content instanceof Y.Doc)
  );
}

/** Used for recording documents on the Editing server. */
export interface DocumentRegistration {
  /** Document to be registered. */
  document: Document;

  /** IP address of the Editing server that the client can contact. */
  clientContactNode: string;

  /** List of Editing server nodes assigned to this document. */
  nodes: string[];

  /** List of clients (socket.io socket.ids) currently editing the document. */
  clients: string[];
}

/** Used for pointing the correct editing server to the client. */
export interface EditingServerData {
  /** IP address of the editing server node the client must use. */
  contactNode: string;

  /** Unique identification number of the document. */
  documentID: string;

  /** Name of the document to be edited. */
  documentName: string;
}

/** Type guard for the EditingServerData type. */
export function isEditingServerData(obj: unknown): obj is EditingServerData {
  return (
    (obj as EditingServerData).contactNode !== undefined &&
    typeof (obj as EditingServerData).contactNode === 'string' &&
    (obj as EditingServerData).documentID !== undefined &&
    (typeof (obj as EditingServerData).documentID === 'string' &&
      (obj as EditingServerData).documentName) !== undefined &&
    typeof (obj as EditingServerData).documentName === 'string'
  );
}
