// wsRelay — relays messages between whoever connects. Never interprets
// message content, never touches marker/trial logic. Mobile-compatibility
// note: the HTTP server it attaches to must listen with no host argument
// (binds 0.0.0.0), so the phone can reach it over LAN, not just localhost.

const WebSocket = require('ws');

function attachWsRelay(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });
  const clients = new Set();

  function broadcastPeerCount() {
    const payload = JSON.stringify({ type: 'peer_count', count: clients.size });
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
  }

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log(`[ws] connected from ${req.socket.remoteAddress} (${clients.size} total)`);
    broadcastPeerCount();

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        console.log('[ws] bad json, dropped');
        return;
      }
      console.log('[ws] <-', msg.type ?? '(no type)', msg);
      for (const other of clients) {
        if (other !== ws && other.readyState === WebSocket.OPEN) {
          other.send(JSON.stringify(msg));
        }
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[ws] disconnected (${clients.size} remaining) — server keeps running`);
      broadcastPeerCount();
    });

    ws.on('error', (err) => console.log('[ws] error:', err.message));
  });

  return wss;
}

module.exports = { attachWsRelay };
