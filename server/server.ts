// Extended from y-socket.io/src/server/server.ts
/* eslint-disable import/extensions */

import http from 'http';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import logger from './utils/logger.ts';
import { HOST, PORT } from './utils/config.ts';
import { DocumentRegistration } from './types.ts';
import discovery from './roles/discovery.ts';

discovery();

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
  },
});

const documentRegister: Record<string, DocumentRegistration> = {};

io.on('connection', async (socket: Socket) => {
  logger.info(`[connection] Connected with user: ${socket.id}`);

  await socket.join(socket.id);

  socket.on(
    'register',
    (documentID: string, documentName: string, clientName: string) => {
      if (!(documentID in documentRegister)) {
        documentRegister[documentID] = {
          name: documentName,
          users: [clientName],
          document: new Y.Doc(),
        };
      }
      logger.info(documentRegister);
      setTimeout(() => {
        logger.info(socket.id);
        io.of('/').to(socket.id).emit('hi');
        socket.emit('testi1');
      }, 3000);
    }
  );

  socket.on('update', (update: Uint8Array, editor: number) => {
    logger.info('update', update, editor);
    socket.emit('testi2');
    const normal = io.of('/');
    normal.to(socket.id).emit('hello', 'toinen');
  });

  // socket.on('update', (update: Uint8Array, editor: number) => {
  // Y.applyUpdate(ydoc, update);
  // console.log('socket', editor);
  // console.log('ydoc.getText().toJSON()', ydoc.getText().toJSON());
  // });

  socket.on('disconnect', () => {
    logger.info(`[disconnect] Disconnected with user: ${socket.id}`);
  });
});

// Http server listen
server.listen(PORT, HOST, undefined, () =>
  logger.info(`Server running on ${HOST}:${PORT}`)
);
