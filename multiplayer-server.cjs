const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const url = require('url');
const Y = require('yjs');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');
const { LeveldbPersistence } = require('y-leveldb');
const fs = require('fs');
const path = require('path');

// 确保持久化目录存在
const persistenceDir = process.env.YPERSISTENCE_DIR || './server/data/yjs-docs';
if (!fs.existsSync(persistenceDir)) {
  fs.mkdirSync(persistenceDir, { recursive: true });
}

console.log(`[Multiplayer] Persistence enabled at: ${persistenceDir}`);
const ldb = new LeveldbPersistence(persistenceDir);

// 配置 y-websocket 及其持久化层
setPersistence({
  bindState: async (docName, ydoc) => {
    // 绑定时从数据库加载状态
    const persistedYdoc = await ldb.getYDoc(docName);
    const newVector = Y.encodeStateVector(ydoc);
    const diff = Y.encodeStateAsUpdate(persistedYdoc, newVector);
    Y.applyUpdate(ydoc, diff);
    
    // 监听后续更新并存入数据库
    ydoc.on('update', async (update) => {
      await ldb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName, ydoc) => {
    // 这里可以执行周期性全量写入，但 ldb.storeUpdate 已经实时处理了
    return true;
  }
});

const port = process.env.PORT || 1235;
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // 处理代理请求
  if (parsedUrl.pathname === '/proxy') {
    const targetUrl = parsedUrl.query.url;
    if (!targetUrl) {
      res.writeHead(400);
      return res.end('Missing url parameter');
    }

    const parsedTarget = url.parse(targetUrl);
    const protocol = parsedTarget.protocol === 'https:' ? https : http;

    
    // 过滤并保留关键 Header
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.origin;
    delete headers.referer;

    const proxyReq = protocol.request(targetUrl, {
      method: req.method,
      headers: headers
    }, (proxyRes) => {
      // 允许跨域
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy Error]:', err.message);
      res.writeHead(500);
      res.end('Proxy Error: ' + err.message);
    });

    req.pipe(proxyReq);
    return;
  }

  // 健康检查和 OPTIONS 支持
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  res.writeHead(200, { 
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*' 
  });
  res.end('Yjs Signaling Server with Proxy is Running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { gc: true });
  console.log(`[Multiplayer] New user connected. Active connections: ${wss.clients.size}`);
});

server.listen(port, () => {
  console.log(`[Multiplayer] Signaling server running on ws://localhost:${port}`);
  console.log(`[Proxy] API Proxy enabled at http://localhost:${port}/proxy?url=...`);
});
