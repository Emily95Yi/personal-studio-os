import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const base = new URL('../site/', import.meta.url);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const port = Number(process.env.STUDIO_PORT ?? 4181);
createServer(async (req, res) => {
  const path = req.url?.split('?')[0] === '/' ? '/index.html' : req.url?.split('?')[0] ?? '';
  const type = types[extname(path)];
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  if (!type || !/^\/[a-z][a-z0-9.-]*$/.test(path)) return res.writeHead(404).end();
  try {
    const body = await readFile(new URL(path.slice(1), base));
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log('Personal Studio OS: http://127.0.0.1:' + port));
