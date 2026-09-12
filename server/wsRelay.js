// wsRelay — relays messages between clients paired into the same session.
// Never interprets orchestration message content (marker/trial logic stays
// client-side); the only messages it understands are the two session-join
// control messages below, so it can scope relaying and peer counts per
// session instead of broadcasting to every client on the LAN. Mobile-
// compatibility note: the HTTP server it attaches to must listen with no
// host argument (binds 0.0.0.0), so the phone can reach it over LAN, not
// just localhost.

const WebSocket = require('ws');

function attachWsRelay(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer });
  const clients = new Set();

  function sessionMembers(sessionCode) {
    const members = [];
    for (const c of clients) {
      if (c.sessionCode === sessionCode) members.push(c);
    }
    return members;
  }

  function broadcastPeerCount(sessionCode) {
    const members = sessionMembers(sessionCode);
    const payload = JSON.stringify({ type: 'peer_count', count: members.length });
    for (const c of members) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
  }

  function rigForSession(sessionCode) {
    for (const c of clients) {
      if (c.sessionCode === sessionCode && c.role === 'rig') return c;
    }
    return null;
  }

  wss.on('connection', (ws, req) => {
    ws.sessionCode = null;
    ws.role = 'unknown';
    clients.add(ws);
    console.log(`[ws] connected from ${req.socket.remoteAddress} (${clients.size} total)`);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        console.log('[ws] bad json, dropped');
        return;
      }
      console.log('[ws] <-', msg.type ?? '(no type)', msg);

      // Session control — handled here, never relayed.
      if (msg.type === 'register_rig') {
        ws.sessionCode = msg.sessionCode;
        ws.role = 'rig';
        console.log(`[ws] rig registered session ${msg.sessionCode}`);
        broadcastPeerCount(msg.sessionCode);
        return;
      }
      if (msg.type === 'join') {
        const rig = rigForSession(msg.sessionCode);
        if (!rig) {
          ws.send(JSON.stringify({ type: 'join_ack', ok: false, reason: 'unknown session code' }));
          return;
        }
        ws.sessionCode = msg.sessionCode;
        ws.role = 'phone';
        ws.send(JSON.stringify({ type: 'join_ack', ok: true }));
        console.log(`[ws] phone joined session ${msg.sessionCode}`);
        broadcastPeerCount(msg.sessionCode);
        return;
      }

      // Orchestration/marker events — relay only within the same session.
      // A client that hasn't registered/joined yet has no session and gets
      // nothing relayed to or from it: "commands affect only the paired
      // phone/rig session."
      if (!ws.sessionCode) {
        console.log('[ws] message from unpaired client, dropped');
        return;
      }
      for (const other of sessionMembers(ws.sessionCode)) {
        if (other !== ws && other.readyState === WebSocket.OPEN) {
          other.send(JSON.stringify(msg));
        }
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[ws] disconnected (${clients.size} remaining) — server keeps running`);
      if (ws.sessionCode) broadcastPeerCount(ws.sessionCode);
    });

    ws.on('error', (err) => console.log('[ws] error:', err.message));
  });

  return wss;
}

module.exports = { attachWsRelay };
