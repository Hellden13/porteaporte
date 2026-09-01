const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1');
