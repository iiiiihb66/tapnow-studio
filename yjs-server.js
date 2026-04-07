import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const port = process.env.PORT || 1234;
const wss = new WebSocketServer({ port });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
  console.log(`[Yjs-Server] New collaborator connected. Total: ${wss.clients.size}`);
});

console.log(`[Multiplayer-System] Signaling server running on ws://localhost:${port}`);
