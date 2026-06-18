// Minimal, dependency-free `.xlsx` (OOXML SpreadsheetML) writer.
//
// We deliberately avoid pulling in a spreadsheet dependency (the npm `xlsx`
// package is large and ships its own deprecated registry tarball) — the
// extension only needs to emit a single flat worksheet. An `.xlsx` file is a
// ZIP archive of a handful of XML parts; we build those parts by hand and pack
// them with a tiny STORE-only (no compression) ZIP writer, which is enough for
// Excel / LibreOffice / Google Sheets to open the file without any warning.

// ─── Public API ──────────────────────────────────────────────────────────────

export type CellType = 'text' | 'money' | 'number';

export interface SheetColumn<T> {
  header: string;
  /** Pull the raw cell value out of a row. `null`/`undefined`/'' → blank cell. */
  value: (row: T) => string | number | null | undefined;
  /** Drives cell formatting. Defaults to `'text'`. */
  type?: CellType;
  /** Column width in characters (Excel units). */
  width?: number;
}

export interface BuildXlsxOptions<T> {
  columns: SheetColumn<T>[];
  rows: T[];
  /** Worksheet tab name (truncated to Excel's 31-char limit). */
  sheetName?: string;
}

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Build an `.xlsx` workbook (single sheet) as a Blob ready for download. */
export function buildXlsxBlob<T>(opts: BuildXlsxOptions<T>): Blob {
  const bytes = buildXlsx(opts);
  // Re-wrap so the BlobPart type is the plain `Uint8Array<ArrayBuffer>` (some
  // TS DOM libs widen `buffer` to `ArrayBufferLike`, which Blob rejects).
  return new Blob([new Uint8Array(bytes)], { type: XLSX_MIME });
}

/** Build an `.xlsx` workbook (single sheet) as raw bytes. */
export function buildXlsx<T>({ columns, rows, sheetName }: BuildXlsxOptions<T>): Uint8Array {
  const sheetXml = buildSheetXml(columns, rows);
  const safeSheetName = escapeXml((sheetName || 'Planilha').slice(0, 31)) || 'Planilha';

  const files: ZipEntry[] = [
    file('[Content_Types].xml', CONTENT_TYPES),
    file('_rels/.rels', ROOT_RELS),
    file('xl/workbook.xml', workbookXml(safeSheetName)),
    file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS),
    file('xl/styles.xml', STYLES),
    file('xl/worksheets/sheet1.xml', sheetXml),
  ];

  return buildZip(files);
}

// ─── Worksheet XML ───────────────────────────────────────────────────────────

// Style indexes defined in STYLES (cellXfs order below).
const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_MONEY = 2;

function buildSheetXml<T>(columns: SheetColumn<T>[], rows: T[]): string {
  const colCount = columns.length;

  const cols = columns
    .map((c, i) => {
      const width = c.width ?? Math.max(10, Math.min(60, c.header.length + 4));
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join('');

  const headerCells = columns
    .map((c, i) => textCell(colRef(i + 1, 1), c.header, STYLE_HEADER))
    .join('');
  const headerRow = `<row r="1">${headerCells}</row>`;

  const bodyRows = rows
    .map((row, rIdx) => {
      const r = rIdx + 2; // row 1 is the header
      const cells = columns
        .map((col, cIdx) => {
          const ref = colRef(cIdx + 1, r);
          const raw = col.value(row);
          const type = col.type ?? 'text';
          if (type === 'money' || type === 'number') {
            const n = toNumber(raw);
            if (n == null) return '';
            return numberCell(ref, n, type === 'money' ? STYLE_MONEY : STYLE_DEFAULT);
          }
          const text = raw == null ? '' : String(raw);
          if (!text) return '';
          return textCell(ref, text, STYLE_DEFAULT);
        })
        .join('');
      return `<row r="${r}">${cells}</row>`;
    })
    .join('');

  const dimension = `A1:${colRef(Math.max(1, colCount), rows.length + 1)}`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${headerRow}${bodyRows}</sheetData>` +
    `<autoFilter ref="${dimension}"/>` +
    `</worksheet>`
  );
}

function textCell(ref: string, value: string, style: number): string {
  const s = style ? ` s="${style}"` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(ref: string, value: number, style: number): string {
  const s = style ? ` s="${style}"` : '';
  return `<c r="${ref}"${s}><v>${value}</v></c>`;
}

function toNumber(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** 1-based (col, row) → A1-style reference. */
function colRef(col: number, row: number): string {
  let n = col;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row}`;
}

function escapeXml(s: string): string {
  // Drop characters that are illegal in XML 1.0 (control chars below 0x20 other
  // than tab/LF/CR) — a stray byte in a malformed XML payload would otherwise
  // corrupt the whole workbook.
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Static OOXML parts ──────────────────────────────────────────────────────

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
  `</Relationships>`;

function workbookXml(sheetName: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

// numFmtId 164 = custom "#,##0.00" (money). cellXfs order maps to the
// STYLE_* indexes above: 0 default, 1 bold header, 2 money.
const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// ─── Minimal STORE-only ZIP writer ──────────────────────────────────────────

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function file(name: string, content: string): ZipEntry {
  return { name, data: new TextEncoder().encode(content) };
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method = 0 (store)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    localChunks.push(local, entry.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central dir header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0x21, true); // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true); // compressed size
    cv.setUint32(24, size, true); // uncompressed size
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centralChunks.push(central);

    offset += local.length + entry.data.length;
  }

  const centralSize = centralChunks.reduce((sum, c) => sum + c.length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir signature
  ev.setUint16(4, 0, true); // disk number
  ev.setUint16(6, 0, true); // central dir start disk
  ev.setUint16(8, entries.length, true); // entries on this disk
  ev.setUint16(10, entries.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true); // comment length

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of localChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  out.set(eocd, pos);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
