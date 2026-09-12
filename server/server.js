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
  const ips = localIps();
  // Kiosk mode must be launched against the LAN IP, not localhost: the start
  // screen's pairing QR encodes location.hostname verbatim (see
  // startScreen.js's firstLanUrl), so a kiosk window opened via localhost
  // bakes in an address the phone can never reach — it's the phone's own
  // loopback from its perspective, not the laptop's.
  if (ips.length > 0) {
    console.log(`Kiosk mode:  chrome --kiosk http://${ips[0]}:${PORT}`);
  } else {
    console.log(`Kiosk mode:  chrome --kiosk http://localhost:${PORT}  (no LAN IP found — phone pairing needs one)`);
  }
  for (const ip of ips) {
    console.log(`Phone connects to: ws://${ip}:${PORT}`);
  }
});
