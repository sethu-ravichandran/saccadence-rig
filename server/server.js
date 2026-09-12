// server — thin entry point. Wires httpServer + wsRelay together and listens.

const path = require('path');
const os = require('os');
const { createHttpServer } = require('./httpServer');
const { attachWsRelay } = require('./wsRelay');

const PORT = 8765;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const server = createHttpServer(PUBLIC_DIR);
attachWsRelay(server);

function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

// No host argument => binds 0.0.0.0, reachable from the phone over LAN.
server.listen(PORT, () => {
  console.log(`Saccadence stimulus rig on http://localhost:${PORT}`);
  console.log(`Kiosk mode:  chrome --kiosk http://localhost:${PORT}`);
  for (const ip of localIps()) {
    console.log(`Phone connects to: ws://${ip}:${PORT}`);
  }
});
