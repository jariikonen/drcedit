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
export const STORAGE_DIR = process.env.STORAGE_DIR ?? 'storage';
export const STORAGE_DOCUMENTS_PATH =
  process.env.STORAGE_DOCUMENTS_PATH ?? 'storage/documents.json';
export const GATEWAY_HTTP_PORT = parseInt(
  `${process.env.GATEWAY_HTTP_PORT ?? 8080}`,
  10
);
export const EDITING_NUM_OF_NODES = parseInt(
  `${process.env.EDITING_NUM_OF_NODES ?? 3}`,
  10
);
export const CONSENSUS_ELMIN = parseInt(
  `${process.env.CONSENSUS_ELMIN ?? 150}`,
  10
);
export const CONSENSUS_ELMAX = parseInt(
  `${process.env.CONSENSUS_ELMAX ?? 600}`,
  10
);
export const CONSENSUS_RESPTO = parseInt(
  `${process.env.CONSENSUS_RESPTO ?? 1000}`,
  10
);
