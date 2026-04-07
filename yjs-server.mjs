import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import pkg from 'y-websocket/bin/utils';
const { setupWSConnection } = pkg;

const port = process.env.PORT || 1234;
const wss = new WebSocketServer({ port });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
  console.log(`[Multiplayer-Server] New collaborator joined. Total: ${wss.clients.size}`);
});

console.log(`[Multiplayer-Server] Signaling server listening on ws://localhost:${port}`);
