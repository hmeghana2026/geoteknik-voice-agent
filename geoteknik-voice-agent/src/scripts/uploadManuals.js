require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Convert .doc or .docx to plain text using LibreOffice
function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ext);

  if (ext === '.doc') {
    // Convert .doc to .docx first
    execSync(`soffice --headless --convert-to docx "${filePath}" --outdir "${dir}"`);
    filePath = path.join(dir, base + '.docx');
  }

  // Convert .docx to .txt
  execSync(`soffice --headless --convert-to txt:Text "${filePath}" --outdir "${dir}"`);
  const txtPath = path.join(dir, base + '.txt');
  return fs.readFileSync(txtPath, 'utf-8');
}

// Split text into overlapping chunks of ~400 words
function chunkText(text, chunkSize = 400, overlap = 50) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 30) chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

async function uploadManual(productName, filePath) {
  console.log(`\nProcessing: ${filePath}`);

  // Extract text
  let text;
  try {
    text = extractText(filePath);
  } catch (err) {
    // Fallback: try reading as plain text directly
    text = fs.readFileSync(filePath, 'utf-8');
  }

  if (!text || text.trim().length < 50) {
    console.log(`  Skipping — could not extract text from ${filePath}`);
    return;
  }

  const chunks = chunkText(text);
  console.log(`  Extracted ${chunks.length} chunks from "${productName}"`);

  // Delete existing chunks for this product first (clean re-upload)
  await supabase.from('manuals').delete().eq('product_name', productName);
  console.log(`  Cleared existing entries for "${productName}"`);

  let uploaded = 0;
  for (const chunk of chunks) {
    try {
      // Get embedding from OpenAI
      const embeddingRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunk,
      });
      const embedding = embeddingRes.data[0].embedding;

      // Upload to Supabase
      const { error } = await supabase.from('manuals').insert({
        product_name: productName,
        content: chunk,
        embedding: embedding,
      });

      if (error) {
        console.error(`  Error uploading chunk ${uploaded + 1}:`, error.message);
      } else {
        uploaded++;
        process.stdout.write(`\r  Uploaded ${uploaded}/${chunks.length} chunks...`);
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.error(`  Error on chunk ${uploaded + 1}:`, err.message);
    }
  }

  console.log(`\n  Done — ${uploaded} chunks uploaded for "${productName}"`);
}

async function main() {
  console.log('Geoteknik Manual Upload Tool');
  console.log('============================');

  // Define your manuals here — add one line per product manual
  const manuals = [
    {
      productName: 'South GNSS GPS - Pratik Bilgiler',
      filePath: './manuals/Pratik_Bilgiler.doc'
    },
    {
      productName: 'South GNSS GPS - Kullanım Klavuzu',
      filePath: './manuals/SOUTH_Kullanım_Klavuzu.docx'
    },
  ];

  for (const manual of manuals) {
    if (!fs.existsSync(manual.filePath)) {
      console.log(`\nSkipping "${manual.productName}" — file not found: ${manual.filePath}`);
      continue;
    }
    await uploadManual(manual.productName, manual.filePath);
  }

  console.log('\n============================');
  console.log('All manuals processed!');
  console.log('Check Supabase Table Editor → manuals to verify.');
}

main().catch(console.error);