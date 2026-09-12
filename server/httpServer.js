// httpServer — static file serving only. Doesn't know WebSockets exist.

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

function createHttpServer(publicDir) {
  return http.createServer((req, res) => {
    const reqPath = req.url === '/' ? '/index.html' : req.url;
    const filePath = path.join(publicDir, reqPath);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

module.exports = { createHttpServer };
