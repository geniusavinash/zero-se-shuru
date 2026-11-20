import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { parseCsv } from '../eval/common.ts';

interface Sheet {
  name: string;
  description: string;
  headers: string[];
  rows: string[][];
  wrapColumn?: string;
}

const out = '.cache/exports';
const output = join(out, 'zero-se-shuru-sheet.xlsx');
const read = (path: string): string => readFileSync(path, 'utf8');
const meta = JSON.parse(read('site/data/meta.json')) as {
  runId: string;
  generatedAt: string;
  site: { publicUrl: string; repoUrl: string };
};
const samplePath = 'eval/sample_50.json';
const sample = existsSync(samplePath) ? JSON.parse(read(samplePath)) as { runId?: string } : undefined;

const about: Sheet = {
  name: 'About', description: 'Project links, measured run and workbook contents.',
  headers: ['item', 'value'],
  rows: [
    ['title', 'Zero Se Shuru: fresher jobs and internships in India'],
    ['live page URL', meta.site.publicUrl],
    ['repo URL', meta.site.repoUrl],
    ['measured run id', sample?.runId || meta.runId],
    ['posts tab', 'The posts this build of the page shows; the live page refreshes twice a day, so its list can differ slightly.'],
    ['generated time', meta.generatedAt],
  ],
};
const sheets: Sheet[] = [about];
const csvTabs = [
  { name: 'Posts', file: 'posts.csv', description: 'Published jobs and internships, with attribution.' },
  { name: '50-post check', file: 'handcheck_50.csv', description: 'Predictions and labels for the 50-post check. Who labelled, and from what text: the "labelled by" rows on the Numbers tab.' },
  { name: 'Numbers', file: 'numbers.csv', description: 'Accuracy, confidence intervals and tagging costs.' },
  { name: 'Sources', file: 'sources.csv', description: 'Source permissions, attribution and per-source funnel counts.' },
  { name: 'Runs', file: 'runs.csv', description: 'Refresh history, status and cost.' },
];
for (const { name, file, description } of csvTabs) {
  const path = join(out, file);
  if (!existsSync(path)) {
    console.log(`Skipped ${name}: ${path} is missing`);
    continue;
  }
  const text = read(path).replace(/^\uFEFF/, '');
  const records = parseCsv(text);
  // A synthetic body row lets the same parser expose headers in a header-only export.
  const headers = Object.keys(records[0] ?? parseCsv(`${text}\n__header_probe__`)[0] ?? {});
  if (headers.length === 0) throw new Error(`No CSV header in ${path}`);
  sheets.push({ name, description, headers, rows: records.map((r) => headers.map((h) => r[h] ?? '')) });
}

const docs = read('docs/PROMPTS.md');
/** The rows of a section's markdown tables that have `width` cells, with `code` marks and escaped pipes removed. */
function mdTable(section: string, width: number): string[][] {
  return section.split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return [];
    const cells = trimmed.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) =>
      cell.trim().replace(/\\\|/g, '|').replace(/`([^`]+)`/g, '$1'),
    );
    return cells.length === width && !cells.every((cell) => /^:?-+:?$/.test(cell)) ? [cells] : [];
  });
}

// Part 1: the owner's own prompts to Claude Code, word for word ("the prompts used" includes how the AI was steered).
const mySection = docs.split(/^##\s+1\.[^\r\n]*\r?\n/m)[1]?.split(/^##\s+/m)[0];
if (!mySection) throw new Error('Missing the owner prompts section (## 1.) in docs/PROMPTS.md');
const [myHeaders, ...myRows] = mdTable(mySection, 4);
if (!myHeaders || myRows.length === 0) throw new Error('Missing the owner prompts table in docs/PROMPTS.md');
sheets.push({ name: 'My prompts', description: "The owner's own prompts to Claude Code, word for word, with an English gloss and what each changed.", headers: myHeaders, rows: myRows, wrapColumn: myHeaders[1] });

const toolsSection = docs.split(/^##\s+2\.\s+Tools[^\S\r\n]*\r?\n/m)[1]?.split(/^##\s+/m)[0];
if (!toolsSection) throw new Error('Missing the Tools section in docs/PROMPTS.md');
const [toolHeaders, ...toolRows] = mdTable(toolsSection, 3);
if (!toolHeaders) throw new Error('Missing the AI tools table in docs/PROMPTS.md');
sheets.push({ name: 'AI tools', description: 'AI tools, models and what they were used for.', headers: toolHeaders, rows: toolRows });

const modelPattern = /\bgpt-[\w.-]*[\w-]/i;
function taskModel(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mention = new RegExp(`(?:^|[^\\w.-])${escapedFile}(?![\\w-]|\\.[\\w])`);
  for (const section of docs.split(/(?=^#{2,6}[ \t])/m)) {
    if (!mention.test(section)) continue;
    // Prefer the model in the sentence that names the file, then the section heading.
    for (const sentence of section.split(/\r?\n|(?<=[.!?])\s+/)) {
      if (!mention.test(sentence)) continue;
      const model = sentence.match(modelPattern)?.[0];
      if (model) return model;
    }
    const model = section.split(/\r?\n/, 1)[0]?.match(modelPattern)?.[0];
    if (model) return model;
  }
  return '';
}

function promptText(path: string): string {
  const text = read(path);
  const suffix = '… (truncated)';
  return text.length <= 32_000 ? text : text.slice(0, 32_000 - suffix.length).replace(/[\uD800-\uDBFF]$/, '') + suffix;
}
const taskFiles = readdirSync('tasks', { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name).sort();
sheets.push({
  name: 'Prompts', description: 'Full tagging and worker prompts, with long files truncated.',
  headers: ['name', 'model', 'file', 'text'], wrapColumn: 'text',
  rows: [
    ['In-product tagging prompt', 'gpt-6-luna', 'prompts/tag.md', promptText('prompts/tag.md')],
    ...taskFiles.map((file) => {
      const path = `tasks/${file}`;
      return [file.slice(0, -3), taskModel(path), path, promptText(path)];
    }),
  ],
});
for (const sheet of sheets) {
  if (sheet.name.length > 31 || /[\[\]:*?/\\]/.test(sheet.name)) throw new Error(`Invalid sheet name: ${sheet.name}`);
  about.rows.push([sheet.name, sheet.description]);
}

const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const mainNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageNs = 'http://schemas.openxmlformats.org/package/2006';
const xml = (text: string): string => text
  .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
  // SpreadsheetML decodes _xHHHH_ sequences even in inline strings.
  .replace(/_(?=x[\da-f]{4}_)/gi, '_x005F_')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;').replaceAll('\r', '&#13;');

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + (n - 1) % 26) + name;
  }
  return name;
}

function sheetXml(sheet: Sheet): string {
  const { headers, rows } = sheet;
  const widths = headers.map((h) => h.length);
  const textOnly = headers.map((h) => /^(?:run|link|n|url)$|(?:^|[_\s-])(?:key|id)$/i.test(h));
  const data = [headers, ...rows].map((row, i) => {
    const rowNum = i + 1;
    const cells = row.map((value, j) => {
      widths[j] = Math.max(widths[j] ?? 0, value.length);
      const ref = `${columnName(j)}${rowNum}`;
      const wrap = headers[j] === sheet.wrapColumn || value.length > 60;
      const style = i === 0 ? (wrap ? 3 : 1) : (wrap ? 2 : 0);
      const attrs = `r="${ref}" s="${style}"`;
      const numeric = i > 0 && !textOnly[j] && /^-?\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value));
      return numeric
        ? `<c ${attrs}><v>${value}</v></c>`
        : `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNum}">${cells}</row>`;
  }).join('');
  const range = `A1:${columnName(headers.length - 1)}${rows.length + 1}`;
  const cols = widths.map((width, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${Math.max(8, Math.min(60, width + 2))}" customWidth="1"/>`,
  ).join('');
  return `${declaration}<worksheet xmlns="${mainNs}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${data}</sheetData><autoFilter ref="${range}"/></worksheet>`;
}

const styles = `${declaration}<styleSheet xmlns="${mainNs}">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const contentType = (part: string, type: string): string => `<Override PartName="/${part}" ContentType="application/vnd.${type}+xml"/>`;
const spreadsheetType = 'openxmlformats-officedocument.spreadsheetml';
const rel = (id: string, type: string, target: string): string => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;
const relationships = (body: string): string => `${declaration}<Relationships xmlns="${packageNs}/relationships">${body}</Relationships>`;
const sheetPart = (i: number): string => `worksheets/sheet${i + 1}.xml`;
const entries: [string, string][] = [
  ['[Content_Types].xml', `${declaration}<Types xmlns="${packageNs}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${contentType('docProps/app.xml', 'openxmlformats-officedocument.extended-properties')}${contentType('docProps/core.xml', 'openxmlformats-package.core-properties')}${contentType('xl/workbook.xml', `${spreadsheetType}.sheet.main`)}${contentType('xl/styles.xml', `${spreadsheetType}.styles`)}${sheets.map((_, i) => contentType(`xl/${sheetPart(i)}`, `${spreadsheetType}.worksheet`)).join('')}</Types>`],
  ['_rels/.rels', relationships(
    rel('rId1', `${relNs}/officeDocument`, 'xl/workbook.xml') +
    rel('rId2', `${packageNs}/relationships/metadata/core-properties`, 'docProps/core.xml') +
    rel('rId3', `${relNs}/extended-properties`, 'docProps/app.xml'),
  )],
  ['docProps/app.xml', `${declaration}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Zero Se Shuru</Application></Properties>`],
  ['docProps/core.xml', `${declaration}<cp:coreProperties xmlns:cp="${packageNs}/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Zero Se Shuru: fresher jobs and internships in India</dc:title></cp:coreProperties>`],
  ['xl/workbook.xml', `${declaration}<workbook xmlns="${mainNs}" xmlns:r="${relNs}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels', relationships(sheets.map((_, i) => rel(`rId${i + 1}`, `${relNs}/worksheet`, sheetPart(i))).join('') + rel(`rId${sheets.length + 1}`, `${relNs}/styles`, 'styles.xml'))],
  ['xl/styles.xml', styles],
];
for (const [i, sheet] of sheets.entries()) entries.push([`xl/${sheetPart(i)}`, sheetXml(sheet)]);

/** ZIP32 with raw DEFLATE and sizes/checksums in both headers (no data descriptors). */
function zip(parts: [string, string][]): Buffer {
  const files: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of parts) {
    const name = Buffer.from(path, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // Version needed to extract.
    local.writeUInt16LE(0x0800, 6); // UTF-8 filenames.
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x0021, 12); // DOS date: 1980-01-01.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    files.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // Version made by, DOS host.
    local.copy(central, 6, 4, 30); // Same fields from version needed through extra length.
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.reduce((size, buf) => size + buf.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}

writeFileSync(output, zip(entries));
for (const sheet of sheets) console.log(`${sheet.name}: ${sheet.rows.length} data rows`);
console.log(`Wrote ${output}`);
