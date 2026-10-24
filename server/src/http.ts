// HTTP API, SSE stream and static hosting of the office UI from the repository root.
// Agents can write files and run commands, so the server only answers loopback hosts by default
// and only accepts JSON POSTs from its own origin (blocks CSRF and DNS-rebinding from web pages).

import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { HOST, PORT, ROOT_DIR } from './env.ts';
import { HttpError, type Colony, type Outgoing } from './runtime.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

function allowedHosts(): Set<string> {
  const hosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`]);
  hosts.add(`${HOST}:${PORT}`);
  return hosts;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON');
  let size = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, 'Body too large');
    parts.push(chunk as Buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function sseLine(m: Outgoing | { kind: 'snapshot'; data: unknown }): string {
  if (m.kind === 'event') return `id: ${m.event.id}\ndata: ${JSON.stringify({ ...m.event, state: m.state })}\n\n`;
  return `event: ${m.kind}\ndata: ${JSON.stringify(m.data)}\n\n`;
}

// Serve repository files for the UI, never the server code, dot-folders (.git, .env, .claude) or dependencies.
function serveStatic(pathname: string, res: ServerResponse) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
  const file = resolve(ROOT_DIR, rel);
  const inside = relative(ROOT_DIR, file);
  const first = inside.split(sep)[0] ?? '';
  const type = TYPES[extname(file).toLowerCase()];
  if (!type || inside.startsWith('..') || first === 'server' || inside.split(sep).some((s) => s.startsWith('.') || s === 'node_modules')) {
    return sendJson(res, 404, { error: 'Not found' });
  }
  try {
    if (!statSync(file).isFile()) throw new Error();
  } catch {
    return sendJson(res, 404, { error: 'Not found' });
  }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}

export function startHttp(colony: Colony, health: () => Record<string, unknown>) {
  const clients = new Set<ServerResponse>();
  const hosts = allowedHosts();
  const checkHost = LOOPBACK.has(HOST);

  colony.subscribe((m) => {
    const line = sseLine(m);
    for (const c of clients) c.write(line);
  });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (checkHost && !hosts.has(String(req.headers.host))) throw new HttpError(421, 'Unexpected Host header');
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const origin = req.headers.origin;
        if (origin && !hosts.has(new URL(origin).host)) throw new HttpError(403, 'Cross-origin request refused');
      }
      const path = url.pathname;

      if (req.method === 'GET' && path === '/api/health') return sendJson(res, 200, { ...health(), sseClients: clients.size });
      if (req.method === 'GET' && path === '/api/state') return sendJson(res, 200, colony.snapshot());

      if (req.method === 'GET' && path === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        // Every (re)connect starts from a full snapshot, so a dropped connection never leaves the office stale.
        res.write(`retry: 2000\n\n${sseLine({ kind: 'snapshot', data: colony.snapshot() })}`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }

      if (req.method === 'POST' && path === '/api/tasks') {
        const body = await readJson(req);
        const run = colony.submit(String(body.text ?? ''));
        return sendJson(res, 202, { run });
      }

      const approval = path.match(/^\/api\/approvals\/([\w-]+)$/);
      if (req.method === 'POST' && approval) {
        const body = await readJson(req);
        if (typeof body.approve !== 'boolean') throw new HttpError(400, 'Send {"approve": true|false}');
        const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null;
        await colony.decide(approval[1], body.approve, reason);
        return sendJson(res, 202, { ok: true });
      }

      const cancel = path.match(/^\/api\/runs\/([\w-]+)\/cancel$/);
      if (req.method === 'POST' && cancel) {
        await readJson(req);
        colony.cancel(cancel[1]);
        return sendJson(res, 202, { ok: true });
      }

      if (path.startsWith('/api/')) throw new HttpError(404, 'Unknown endpoint');
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
      return serveStatic(path, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) sendJson(res, status, { error: err instanceof Error ? err.message : 'Server error' });
      else res.end();
    }
  });

  server.listen(PORT, HOST);
  return { server, clients };
}
