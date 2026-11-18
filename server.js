// Telnyx SMS 收件箱 — Northflank 版（Node，无任何 npm 依赖）
// 接收 Telnyx 发来的短信 webhook（message.received 等事件），存到磁盘 data/messages.json，
// 在 / 页面直接查看短信正文，/api/messages 取 JSON。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_KEEP = 100;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return []; }
}

function save(msgs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(msgs, null, 2));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && (url.pathname === '/' || url.pathname === '/webhook')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw); } catch {
        res.writeHead(400); res.end('bad json'); return;
      }
      const data = body.data || {};
      const payload = data.payload || {};
      const toList = Array.isArray(payload.to) ? payload.to : [];
      const record = {
        id: data.id || payload.id || `${Date.now()}`,
        event: data.event_type || 'unknown',
        direction: payload.direction || '',
        from: (payload.from && payload.from.phone_number) || '',
        to: toList.map((t) => t.phone_number).join(', '),
        text: payload.text || '',
        status: (toList[0] && toList[0].status) || '',
        at: data.occurred_at || new Date().toISOString(),
        receivedAt: new Date().toISOString(),
      };
      const msgs = load();
      msgs.unshift(record);
      save(msgs.slice(0, MAX_KEEP));
      res.writeHead(200); res.end('ok');
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/messages') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(load().slice(0, 50)));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    const msgs = load().slice(0, 50);
    const rows = msgs.map((m) =>
      `<tr><td>${esc(m.at)}</td><td>${esc(m.event)}</td><td>${esc(m.direction)}</td>` +
      `<td>${esc(m.from)}</td><td>${esc(m.to)}</td><td><b>${esc(m.text)}</b></td></tr>`
    ).join('') || '<tr><td colspan="6">暂无短信</td></tr>';
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<meta http-equiv="refresh" content="30">` +
      `<title>Telnyx SMS 收件箱</title>` +
      `<style>body{font-family:sans-serif;margin:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:14px}th{background:#f2f2f2}</style>` +
      `</head><body><h2>Telnyx SMS 收件箱（+1 551 205 8690）</h2>` +
      `<p>共 ${msgs.length} 条，每 30 秒自动刷新。最新在最上面。</p>` +
      `<table><tr><th>时间 (UTC)</th><th>事件</th><th>方向</th><th>发件人</th><th>收件人</th><th>内容</th></tr>${rows}</table>` +
      `</body></html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log(`Telnyx SMS inbox listening on :${PORT}`));
