const WebSocket = require('ws');
const http = require('http');
const Y = require('yjs');
const { setupWSConnection } = require('y-websocket/bin/utils');

const port = process.env.PORT || 1234;
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end('Yjs Signaling Server is Running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
  console.log(`[Multiplayer] New user connected. Active connections: ${wss.clients.size}`);
});

server.listen(port, () => {
  console.log(`[Multiplayer] Signaling server running on ws://localhost:${port}`);
});
