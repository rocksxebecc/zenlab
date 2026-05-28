/**
 * Zenspace Local Server
 * - Serves all static files (replaces `npx serve`)
 * - Proxies /api/math → Groq so the API key never reaches the browser
 */

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const url     = require('url');

// ── Load .env manually (no dependencies needed) ───────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
  });
}

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const PORT         = process.env.PORT || 3000;

// ── MIME types ─────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

// ── Proxy request to Groq ──────────────────────────────────────
function proxyMath(req, res) {
  if (!GROQ_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'GROQ_API_KEY not set in .env file on the server.' } }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers:  {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const proxy = https.request(options, groqRes => {
      res.writeHead(groqRes.statusCode, { 'Content-Type': 'application/json' });
      groqRes.pipe(res);
    });
    proxy.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Proxy error: ${err.message}` } }));
    });
    proxy.write(body);
    proxy.end();
  });
}

// ── Serve static files ─────────────────────────────────────────
function serveStatic(req, res) {
  let filePath = path.join(__dirname, url.parse(req.url).pathname);

  // Directory → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  // No extension → try .html
  if (!path.extname(filePath) && !fs.existsSync(filePath)) {
    filePath += '.html';
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('404 Not Found'); return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
}

// ── Main server ────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/api/math') {
    proxyMath(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║        Zenspace Server Running           ║');
  console.log(`  ║   http://localhost:${PORT}                   ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
  if (!GROQ_API_KEY) {
    console.log('  ⚠️  GROQ_API_KEY not set in .env — Math Agent will not work.');
    console.log('  ℹ️  Add it to .env: GROQ_API_KEY=gsk_...');
  } else {
    console.log('  ✅  Groq API key loaded — Math Agent ready!');
  }
  console.log('');
});
