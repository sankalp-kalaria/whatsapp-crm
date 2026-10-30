import zlib from 'zlib';

export interface ExcelLeadRow {
  phone: string;
  name: string;
  email: string;
  configuration: string;
  budgetRange: string;
  carpetPreference: string;
  inquiryType: string;
  leadStage: string;
  preferredLocation: string;
  possessionTimeline: string;
  siteVisitStatus: string;
  siteVisitDate: string;
  siteVisitTime: string;
  siteVisitAvailability: string;
  followUpDate: string;
  brokerNotes: string;
  isConvertedClient: string;
  unreadCount: string;
  lastMessageText: string;
  clientMessagesText: string;
  lastActivityDate: string;
}

export const EXCEL_LEAD_COLUMNS: Array<{
  key: keyof ExcelLeadRow;
  header: string;
  width: number;
}> = [
  { key: 'phone', header: 'Phone Number', width: 18 },
  { key: 'name', header: 'Lead Name', width: 24 },
  { key: 'email', header: 'Email', width: 24 },
  { key: 'configuration', header: 'Configuration (BHK)', width: 20 },
  { key: 'budgetRange', header: 'Budget Range', width: 24 },
  { key: 'carpetPreference', header: 'Carpet Preference', width: 20 },
  { key: 'inquiryType', header: 'Inquiry Type', width: 16 },
  { key: 'leadStage', header: 'Lead Stage', width: 22 },
  { key: 'preferredLocation', header: 'Preferred Location', width: 24 },
  { key: 'possessionTimeline', header: 'Possession Timeline', width: 22 },
  { key: 'siteVisitStatus', header: 'Site Visit Status', width: 18 },
  { key: 'siteVisitDate', header: 'Site Visit Date', width: 16 },
  { key: 'siteVisitTime', header: 'Site Visit Time', width: 16 },
  { key: 'siteVisitAvailability', header: 'Site Visit Availability', width: 26 },
  { key: 'followUpDate', header: 'Follow-Up Date', width: 16 },
  { key: 'brokerNotes', header: 'Broker Notes', width: 32 },
  { key: 'isConvertedClient', header: 'Converted Client', width: 16 },
  { key: 'unreadCount', header: 'Unread Count', width: 14 },
  { key: 'lastMessageText', header: 'Last Message', width: 36 },
  { key: 'clientMessagesText', header: 'Complete Client Messages', width: 48 },
  { key: 'lastActivityDate', header: 'Last Activity Date', width: 22 },
];

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colIndexToLetter(index: number): string {
  let col = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function colLetterToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

// CRC32 Lookup Table for ZIP archive generation
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

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createZipBuffer(files: Array<{ name: string; content: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const uncompressed = file.content;
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    // Local File Header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // compression method: DEFLATE (8)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuf, compressed);

    // Central Directory Header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // compression: DEFLATE
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk
    centralHeader.writeUInt16LE(0, 36); // int attrs
    centralHeader.writeUInt32LE(0, 38); // ext attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

function unzipEntries(zipBuf: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let pos = 0;

  while (pos + 30 <= zipBuf.length) {
    const sig = zipBuf.readUInt32LE(pos);
    if (sig !== 0x04034b50) break;

    const flags = zipBuf.readUInt16LE(pos + 6);
    const method = zipBuf.readUInt16LE(pos + 8);
    let compressedSize = zipBuf.readUInt32LE(pos + 18);
    const nameLen = zipBuf.readUInt16LE(pos + 26);
    const extraLen = zipBuf.readUInt16LE(pos + 28);

    const name = zipBuf.subarray(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;

    // If bit 3 of general purpose flag is set, sizes may be in Central Directory
    if ((flags & 0x08) !== 0 && compressedSize === 0) {
      break;
    }

    const rawData = zipBuf.subarray(dataStart, dataStart + compressedSize);
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      try {
        const outBuf =
          method === 0
            ? rawData
            : method === 8
              ? zlib.inflateRawSync(rawData)
              : null;
        if (outBuf) {
          entries.set(name, outBuf.toString('utf8'));
        }
      } catch {
        // Fallback handled via Central Directory below
      }
    }

    pos = dataStart + compressedSize;
  }

  // Also scan via Central Directory if local headers used data descriptors (flags bit 3)
  let eocdPos = -1;
  for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos !== -1) {
    const totalEntries = zipBuf.readUInt16LE(eocdPos + 10);
    let cdPos = zipBuf.readUInt32LE(eocdPos + 16);

    for (let e = 0; e < totalEntries && cdPos + 46 <= zipBuf.length; e++) {
      if (zipBuf.readUInt32LE(cdPos) !== 0x02014b50) break;
      const method = zipBuf.readUInt16LE(cdPos + 10);
      const compressedSize = zipBuf.readUInt32LE(cdPos + 20);
      const nameLen = zipBuf.readUInt16LE(cdPos + 28);
      const extraLen = zipBuf.readUInt16LE(cdPos + 30);
      const commentLen = zipBuf.readUInt16LE(cdPos + 32);
      const localOffset = zipBuf.readUInt32LE(cdPos + 42);

      const name = zipBuf
        .subarray(cdPos + 46, cdPos + 46 + nameLen)
        .toString('utf8');

      if (!entries.has(name) && (name.endsWith('.xml') || name.endsWith('.rels'))) {
        const localNameLen = zipBuf.readUInt16LE(localOffset + 26);
        const localExtraLen = zipBuf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const rawData = zipBuf.subarray(dataStart, dataStart + compressedSize);
        try {
          const outBuf =
            method === 0
              ? rawData
              : method === 8
                ? zlib.inflateRawSync(rawData)
                : null;
          if (outBuf) {
            entries.set(name, outBuf.toString('utf8'));
          }
        } catch {
          // Ignore malformed entry
        }
      }

      cdPos += 46 + nameLen + extraLen + commentLen;
    }
  }

  return entries;
}

/**
 * Generates a native Microsoft Excel (.xlsx) workbook Buffer containing all
 * separate Real Estate Filter Lead columns.
 */
export function buildLeadsXlsxBuffer(rows: ExcelLeadRow[]): Buffer {
  const colsXml = EXCEL_LEAD_COLUMNS.map(
    (c, idx) =>
      `<col min="${idx + 1}" max="${idx + 1}" width="${c.width}" customWidth="1"/>`
  ).join('');

  // Row 1: Header row (style s="1")
  const headerCells = EXCEL_LEAD_COLUMNS.map((col, cIdx) => {
    const cellRef = `${colIndexToLetter(cIdx)}1`;
    return `<c r="${cellRef}" t="inlineStr" s="1"><is><t>${escapeXml(
      col.header
    )}</t></is></c>`;
  }).join('');

  const dataRowsXml = rows
    .map((row, rIdx) => {
      const rowNum = rIdx + 2;
      const cellsXml = EXCEL_LEAD_COLUMNS.map((col, cIdx) => {
        const cellRef = `${colIndexToLetter(cIdx)}${rowNum}`;
        const val = row[col.key] ?? '';
        return `<c r="${cellRef}" t="inlineStr" s="2"><is><t>${escapeXml(
          String(val)
        )}</t></is></c>`;
      }).join('');
      return `<row r="${rowNum}">${cellsXml}</row>`;
    })
    .join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${headerCells}</row>
    ${dataRowsXml}
  </sheetData>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="10"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF6D28D9"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE5E7EB"/></left>
      <right style="thin"><color rgb="FFE5E7EB"/></right>
      <top style="thin"><color rgb="FFE5E7EB"/></top>
      <bottom style="thin"><color rgb="FFE5E7EB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Filter Leads" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', content: Buffer.from(rootRelsXml, 'utf8') },
    { name: 'xl/workbook.xml', content: Buffer.from(workbookXml, 'utf8') },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: Buffer.from(workbookRelsXml, 'utf8'),
    },
    { name: 'xl/styles.xml', content: Buffer.from(stylesXml, 'utf8') },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: Buffer.from(sheetXml, 'utf8'),
    },
  ]);
}

function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += ch;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.some((cell) => cell !== ''));
}

/**
 * Parses an uploaded `.xlsx` or `.csv` file Buffer into structured `Partial<ExcelLeadRow>[]`.
 */
export function parseUploadedLeadsExcelOrCsv(
  fileBuffer: Buffer,
  fileName: string
): Array<Partial<ExcelLeadRow>> {
  let rawGrid: string[][] = [];

  const isZipXlsx =
    fileBuffer.length >= 4 && fileBuffer.readUInt32LE(0) === 0x04034b50;

  if (isZipXlsx || fileName.toLowerCase().endsWith('.xlsx')) {
    const entries = unzipEntries(fileBuffer);
    const sharedStringsXml = entries.get('xl/sharedStrings.xml') || '';
    const sharedStrings: string[] = [];

    if (sharedStringsXml) {
      const siMatches = sharedStringsXml.match(/<si[\s>][\s\S]*?<\/si>/g) || [];
      for (const si of siMatches) {
        const tMatches = si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
        const text = tMatches
          .map((t) => unescapeXml(t.replace(/<\/?t(?:\s[^>]*)?>/g, '')))
          .join('');
        sharedStrings.push(text);
      }
    }

    // Find worksheet XML
    const sheetXml =
      entries.get('xl/worksheets/sheet1.xml') ||
      Array.from(entries.entries()).find(([k]) =>
        k.startsWith('xl/worksheets/sheet')
      )?.[1] ||
      '';

    if (sheetXml) {
      const rowMatches = sheetXml.match(/<row[\s>][\s\S]*?<\/row>/g) || [];
      for (const rowBlock of rowMatches) {
        const rowCells: string[] = [];
        const cellMatches =
          rowBlock.match(/<c\s+[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || [];
        let nextColIdx = 0;

        for (const cellXml of cellMatches) {
          const refMatch = cellXml.match(/\br="([A-Z]+)\d+"/);
          const colIdx = refMatch
            ? colLetterToIndex(refMatch[1])
            : nextColIdx;
          while (rowCells.length < colIdx) {
            rowCells.push('');
          }

          const typeMatch = cellXml.match(/\bt="([^"]+)"/);
          const cellType = typeMatch ? typeMatch[1] : '';
          let value = '';

          if (cellType === 'inlineStr') {
            const tMatch = cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
            value = tMatch ? unescapeXml(tMatch[1]) : '';
          } else {
            const vMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
            const rawVal = vMatch ? unescapeXml(vMatch[1]) : '';
            if (cellType === 's') {
              const sIdx = parseInt(rawVal, 10);
              value =
                !Number.isNaN(sIdx) && sharedStrings[sIdx] !== undefined
                  ? sharedStrings[sIdx]
                  : rawVal;
            } else {
              value = rawVal;
            }
          }

          rowCells[colIdx] = value.trim();
          nextColIdx = colIdx + 1;
        }

        if (rowCells.some((c) => c !== '')) {
          rawGrid.push(rowCells);
        }
      }
    }
  } else {
    const text = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    rawGrid = parseCsvRows(text);
  }

  if (rawGrid.length < 2) return [];

  const headerRow = rawGrid[0].map((h) => h.trim().toLowerCase());

  // Map header names flexibly to ExcelLeadRow keys
  const resolveKey = (headerText: string): keyof ExcelLeadRow | null => {
    const h = headerText.toLowerCase().trim();
    if (h.includes('phone') || h.includes('mobile') || h.includes('contact'))
      return 'phone';
    if (h === 'lead name' || h === 'name' || h === 'client name')
      return 'name';
    if (h.includes('email')) return 'email';
    if (h.includes('config') || h.includes('bhk')) return 'configuration';
    if (h.includes('budget')) return 'budgetRange';
    if (h.includes('carpet')) return 'carpetPreference';
    if (h.includes('inquiry') || h.includes('purpose')) return 'inquiryType';
    if (h.includes('stage') || h === 'status') return 'leadStage';
    if (h.includes('location') || h.includes('locality') || h.includes('area'))
      return 'preferredLocation';
    if (h.includes('possession') || h.includes('timeline'))
      return 'possessionTimeline';
    if (h.includes('site visit status')) return 'siteVisitStatus';
    if (h.includes('site visit date') || h === 'visit date')
      return 'siteVisitDate';
    if (h.includes('site visit time') || h === 'visit time')
      return 'siteVisitTime';
    if (h.includes('availability')) return 'siteVisitAvailability';
    if (h.includes('follow-up') || h.includes('follow up'))
      return 'followUpDate';
    if (h.includes('note') || h.includes('remark')) return 'brokerNotes';
    if (h.includes('converted')) return 'isConvertedClient';
    return null;
  };

  const colKeyByIndex: Array<keyof ExcelLeadRow | null> =
    headerRow.map(resolveKey);

  const parsedRows: Array<Partial<ExcelLeadRow>> = [];
  for (let r = 1; r < rawGrid.length; r++) {
    const row = rawGrid[r];
    const obj: Partial<ExcelLeadRow> = {};
    for (let c = 0; c < row.length; c++) {
      const key = colKeyByIndex[c];
      if (key && row[c] !== undefined) {
        obj[key] = row[c].trim();
      }
    }
    if (obj.phone && obj.phone.replace(/\D/g, '').length >= 7) {
      parsedRows.push(obj);
    }
  }

  return parsedRows;
}

