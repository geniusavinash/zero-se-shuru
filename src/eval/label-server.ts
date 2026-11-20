import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { csvCell, PRIVATE_LABELS } from './common.ts';

const path = process.env.LABEL_FILE ?? PRIVATE_LABELS;
if (!existsSync(path)) {
  console.error(`No ${path}: run npm run eval:sample first.`);
  process.exit(1);
}

const taxonomy = loadConfig().taxonomy;
const roles = taxonomy.roles.map(({ id, name }) => ({ id, name }));
const cities = [...taxonomy.cities, ...taxonomy.special_cities].map(({ id, name, aliases }) => ({ id, name, aliases }));
const roleIds = new Set(roles.map(({ id }) => id));
const cityIds = new Set(cities.map(({ id }) => id));
const columns = ['n', 'key', 'source', 'link', 'title', 'company', 'location_text', 'label_role', 'label_cities', 'label_fresher_india', 'label_note'] as const;
const limit = 10 * 1024;
let port = Number(process.env.LABEL_PORT ?? 8081);

// readCsv trims every cell. Keep a lossless copy for rewriting, including quoted
// newlines, whitespace in untouched cells, and any extra columns in the sheet.
function records(text: string) {
  const token = /("(?:[^"]|"")*"|[^",\r\n]*)(,|\r\n?|\n|$)/y;
  const rows: string[][] = [];
  let row: string[] = [];
  let headerEnd = 0;
  while (token.lastIndex < text.length || row.length > 0) {
    const match = token.exec(text);
    if (!match) throw new Error('Invalid CSV cell');
    const raw = match[1]!;
    row.push(raw.startsWith('"') ? raw.slice(1, -1).replaceAll('""', '"') : raw);
    if (match[2] === ',') continue;
    if (rows.length === 0) headerEnd = token.lastIndex - match[2]!.length;
    rows.push(row);
    row = [];
  }
  return { rows, headerEnd };
}

function readSheet() {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const { rows: [header, ...body], headerEnd } = records(text);
  const names = header?.map((name) => name.trim()) ?? [];
  const indexes = new Map(names.map((name, index) => [name, index]));
  for (const name of columns) {
    if (!indexes.has(name)) throw new Error(`Missing CSV column: ${name}`);
  }
  return {
    header: text.slice(0, headerEnd),
    rows: body.filter((row) => row.some((cell) => cell !== '')),
    index: (name: typeof columns[number]) => indexes.get(name)!,
  };
}

type Sheet = ReturnType<typeof readSheet>;
function view(sheet: Sheet, cells: string[]) {
  const field = (name: typeof columns[number]) => cells[sheet.index(name)] ?? '';
  return { ...Object.fromEntries(columns.map((name) => [name, field(name)])), spare: Number(field('n')) > 50 };
}

function encodeCell(value: string) {
  const encoded = csvCell(value);
  // csvCell handles LF and CRLF; quote a bare CR as well so it stays in its cell.
  return encoded.includes('\r') && !encoded.startsWith('"') ? `"${encoded}"` : encoded;
}

function json(res: ServerResponse, status: number, data: object) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        chunks.length = 0;
        resolve(null); // Keep draining so the client can receive the 413.
      } else chunks.push(chunk);
    });
    req.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.once('error', reject);
  });
}

function save(res: ServerResponse, input: unknown) {
  const bad = (error: string) => json(res, 400, { error });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad('Expected a JSON object.');
  const { key, label_role: role, label_cities: selected, label_fresher_india: fresher, label_note: note } = input as Record<string, unknown>;
  if (typeof key !== 'string' || !key) return bad('Choose a row to label.');
  if (typeof role !== 'string' || (role !== '' && !roleIds.has(role))) return bad('Choose a role from the list.');
  if (!Array.isArray(selected) || !selected.every((id): id is string => typeof id === 'string' && cityIds.has(id))) {
    return bad('Choose cities from the list.');
  }
  if (new Set(selected).size !== selected.length) return bad('Do not select a city twice.');
  if (fresher !== '' && fresher !== 'yes' && fresher !== 'no' && fresher !== 'unsure') return bad('Choose Yes, No or Unsure, or leave the answer blank.');
  if (typeof note !== 'string' || note.length > 300 || /[\r\n\u0085\u2028\u2029]/.test(note)) {
    return bad('Use a single-line note of at most 300 characters.');
  }

  // No await between reading, updating and renaming: two requests cannot
  // interleave their read/modify/write operations in this server.
  const sheet = readSheet();
  const cells = sheet.rows.find((row) => row[sheet.index('key')] === key);
  if (!cells) return bad('Row not found. Reload the page and try again.');
  cells[sheet.index('label_role')] = role;
  cells[sheet.index('label_cities')] = [...selected].sort().join(';');
  cells[sheet.index('label_fresher_india')] = fresher;
  cells[sheet.index('label_note')] = note.trim();
  const lines = sheet.rows.map((row) => Array.from(row, (cell) => encodeCell(cell ?? '')).join(','));
  try {
    writeFileSync(`${path}.tmp`, `\uFEFF${[sheet.header, ...lines].join('\n')}\n`, 'utf8');
    renameSync(`${path}.tmp`, path);
  } catch {
    // Review fix: do not leave a stale temp file behind when the rename fails (Excel holding the CSV).
    try {
      rmSync(`${path}.tmp`, { force: true });
    } catch {
      // Best effort: the 409 below is the answer either way.
    }
    return json(res, 409, { error: 'Could not save: close the CSV in Excel and try again.' });
  }
  // Report the on-disk values, including any spreadsheet formula escaping.
  const updated = records(lines[sheet.rows.indexOf(cells)]!).rows[0]!;
  return json(res, 200, { ok: true, row: view(sheet, updated) });
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/labeler.js', ['labeler.js', 'text/javascript; charset=utf-8']],
  ['/labeler.css', ['labeler.css', 'text/css; charset=utf-8']],
]);

async function handle(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host ?? '')) return json(res, 403, { error: 'Host not allowed.' });

  if (req.method === 'GET') {
    if (req.url === '/api/state') {
      const sheet = readSheet();
      const guideline = readFileSync('eval/GUIDELINE.md', 'utf8');
      return json(res, 200, { rows: sheet.rows.map((row) => view(sheet, row)), roles, cities, guideline });
    }
    const asset = assets.get(req.url ?? '');
    if (asset) {
      const [file, type] = asset as [string, string];
      if (file === 'index.html') {
        res.setHeader('content-security-policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      }
      const content = readFileSync(`eval/labeler/${file}`);
      return res.writeHead(200, { 'content-type': type }).end(content);
    }
  }

  if (req.method === 'POST') {
    const origin = req.headers.origin;
    if (origin !== undefined && !hosts.some((host) => origin === `http://${host}`)) return json(res, 403, { error: 'Origin not allowed.' });
    if (req.url === '/api/label') {
      if (Number(req.headers['content-length']) > limit) {
        req.resume();
        return json(res, 413, { error: 'Request body is too large.' });
      }
      if (req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return json(res, 400, { error: 'Content-Type must be application/json.' });
      }
      const body = await readBody(req);
      if (body === null) return json(res, 413, { error: 'Request body is too large.' });
      let input: unknown;
      try {
        input = JSON.parse(body);
      } catch {
        return json(res, 400, { error: 'Invalid JSON.' });
      }
      return save(res, input);
    }
  }
  return json(res, 404, { error: 'Not found.' });
}

const server = createServer((req, res) => {
  void handle(req, res).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Unexpected labeller error');
    if (!res.headersSent) json(res, 500, { error: 'Server error' });
    else res.end();
  });
});
server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') port = address.port;
  console.log(`labeller on http://127.0.0.1:${port} (file: ${path})`);
});
