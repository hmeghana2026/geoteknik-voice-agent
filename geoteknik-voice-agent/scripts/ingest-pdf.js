#!/usr/bin/env node
/**
 * Ingest a PDF manual into the Supabase `manuals` table.
 *
 * Usage:
 *   node scripts/ingest-pdf.js --file <path-to.pdf> --product "Matrice 30" [--chunk 1500] [--overlap 200] [--dry]
 *
 * Approach (page-aware):
 *   1. Extract pages via pdf-parse (PDFParse API).
 *   2. Strip per-page boilerplate (page numbers, copyright, running header).
 *   3. Detect a section title on each page (first heading-like line) and inherit the
 *      previous page's title when no heading is found (multi-page sections).
 *   4. Concatenate consecutive pages that share the same section title.
 *   5. Split each section into ~CHUNK-character chunks at sentence boundaries.
 *   6. Insert one row per chunk: { product_name, section_title, content }.
 *
 * Use --dry to preview chunks without writing to the DB.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const out = { chunk: 1500, overlap: 200, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--file' || a === '-f') out.file = next();
    else if (a === '--product' || a === '-p') out.product = next();
    else if (a === '--chunk') out.chunk = parseInt(next(), 10) || 1500;
    else if (a === '--overlap') out.overlap = parseInt(next(), 10) || 200;
    else if (a === '--dry') out.dry = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/ingest-pdf.js --file <pdf> --product "<name>" [--chunk 1500] [--overlap 200] [--dry]');
      process.exit(0);
    }
  }
  if (!out.file)    { console.error('Missing --file <path-to.pdf>'); process.exit(1); }
  if (!out.product) { console.error('Missing --product "<product name>"'); process.exit(1); }
  return out;
}

// --- Page-level cleaning -----------------------------------------------------

function stripPageNoise(pageText) {
  return pageText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => {
      if (!l) return false;
      if (/^\d+\s*©/.test(l)) return false;             // "76 © 2022 DJI All Rights Reserved."
      if (/©\s*\d{4}.+rights reserved/i.test(l)) return false;
      if (/^Page\s+\d+/i.test(l)) return false;
      if (/^\d{1,4}$/.test(l)) return false;             // bare page numbers
      return true;
    });
}

// Heading heuristic — works well for DJI-style manuals.
function isHeading(line) {
  const s = line.trim();
  if (s.length < 3 || s.length > 90) return false;
  if (/[.!?:;,]$/.test(s)) return false;

  // 1.2.3 Some Title
  if (/^\d+(\.\d+){0,3}\s+[A-Z][A-Za-z0-9].{1,80}$/.test(s)) return true;

  // ALL CAPS short line
  if (/^[A-Z0-9 \-_/&()]+$/.test(s) && /[A-Z]{3,}/.test(s) && s.length <= 60) return true;

  // Title Case 2-8 words
  const words = s.split(/\s+/);
  if (
    words.length >= 2 && words.length <= 8 &&
    /^[A-Z]/.test(s) &&
    words.filter((w) => /^[A-Z][a-z']+$/.test(w) || /^[A-Z]+$/.test(w) || /^\d+$/.test(w)).length >= Math.ceil(words.length * 0.6)
  ) return true;

  return false;
}

// Use the first 1-3 non-noise lines of a page to find a heading.
function detectPageHeading(lines) {
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    if (isHeading(lines[i])) return { title: lines[i], rest: lines.slice(i + 1) };
  }
  return { title: null, rest: lines };
}

// --- Chunking ----------------------------------------------------------------

function chunkText(text, chunkSize, overlap) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  if (t.length <= chunkSize) return [t];

  const sentences = t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  const chunks = [];
  let buf = '';
  for (const sent of sentences) {
    if ((buf + ' ' + sent).trim().length > chunkSize && buf) {
      chunks.push(buf.trim());
      const tail = buf.length > overlap ? buf.slice(-overlap) : buf;
      buf = (tail + ' ' + sent).trim();
    } else {
      buf = (buf ? buf + ' ' : '') + sent;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// --- Main --------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading PDF: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  const pages = result.pages || [];
  console.log(`Extracted ${pages.length} pages.`);

  // Build page-level (title, body) records.
  let lastTitle = 'Introduction';
  const pageRecords = pages.map((p) => {
    const lines = stripPageNoise(p.text || '');
    const { title, rest } = detectPageHeading(lines);
    const useTitle = title || lastTitle;
    if (title) lastTitle = title;
    return { page: p.num, title: useTitle, body: rest.join(' ') };
  });

  // Merge consecutive pages with the same title into one logical section.
  const sections = [];
  for (const rec of pageRecords) {
    const last = sections[sections.length - 1];
    if (last && last.title === rec.title) {
      last.body += ' ' + rec.body;
      last.endPage = rec.page;
    } else {
      sections.push({ title: rec.title, body: rec.body, startPage: rec.page, endPage: rec.page });
    }
  }
  console.log(`Grouped into ${sections.length} sections.`);

  // Chunk each section.
  const rows = [];
  for (const sec of sections) {
    const chunks = chunkText(sec.body, args.chunk, args.overlap);
    chunks.forEach((c, i) => {
      const suffix = chunks.length > 1 ? ` (part ${i + 1}/${chunks.length})` : '';
      rows.push({
        product_name:  args.product,
        section_title: `${sec.title}${suffix}`.slice(0, 240),
        content:       c,
      });
    });
  }
  console.log(`Prepared ${rows.length} chunk rows.`);

  if (args.dry) {
    console.log('\n--- DRY RUN preview (first 3 chunks) ---');
    for (const r of rows.slice(0, 3)) {
      console.log(`\n## ${r.section_title}\n${r.content.slice(0, 400)}${r.content.length > 400 ? '…' : ''}`);
    }
    console.log('\n(Run without --dry to insert into Supabase.)');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.'); process.exit(1); }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('manuals').insert(batch);
    if (error) {
      console.error(`\nInsert failed at batch starting ${i}: ${error.message}`);
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${rows.length}…`);
  }
  console.log(`\nDone. Inserted ${inserted} chunks for product "${args.product}".`);
}

main().catch((e) => { console.error(e); process.exit(1); });
