// WsClient — connection + reconnect-on-drop only. Never interprets what a
// message *means*; just parses JSON and hands it to a callback.

export class WsClient {
  constructor({ onMessage, onOpen }) {
    this.onMessage = onMessage;
    this.onOpen = onOpen ?? (() => {});
    this.ws = null;
    this.reconnectDelay = 500;
    this._connect();
  }

  _connect() {
    this.ws = new WebSocket(`ws://${location.host}`);

    this.ws.onopen = () => {
      console.log('[ws] connected');
      this.reconnectDelay = 500;
      // Fires on first connect AND on every reconnect, so whoever owns
      // session registration doesn't need its own reconnect logic.
      this.onOpen();
    };

    this.ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onMessage(msg);
    };

    this.ws.onclose = () => {
      console.log(`[ws] disconnected, retrying in ${this.reconnectDelay}ms`);
      setTimeout(() => this._connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 5000);
    };

    this.ws.onerror = () => this.ws.close();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }
}
