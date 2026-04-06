/**
 * src/services/knowledgeService.js
 * ================================
 * Unified knowledge retrieval service.
 * 
 * Search priority:
 *   1. Vector search on 'manuals' table (real uploaded manuals)
 *   2. Keyword search on 'demo_kb' table (seeded POC data)
 *   3. Empty result → triggers ticket escalation in twilio.js
 * 
 * This replaces the broken knowledgeBase.js + supabase.js split.
 * Import this in twilio.js instead of the old files.
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getAIResponse } = require('./ai');
const { getEmbedding }  = require('./embeddings');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — called by twilio.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point for knowledge retrieval.
 * Returns structured solution steps, or empty array if nothing found.
 *
 * @param {string} query  - full query string (product + symptoms joined)
 * @returns {Promise<{ steps: string[], source: string, title: string }>}
 */
async function searchKnowledgeBase(query) {
  console.log(`[KB] Searching for: "${query.slice(0, 80)}..."`);

  // ── Priority 1: Vector search on real manuals ──────────────────────────
  try {
    const vectorResult = await vectorSearch(query);
    if (vectorResult.steps.length > 0) {
      console.log(`[KB] ✓ Vector search hit (${vectorResult.steps.length} steps)`);
      return vectorResult;
    }
  } catch (err) {
    console.warn(`[KB] Vector search failed (non-fatal): ${err.message}`);
  }

  // ── Priority 2: Demo KB keyword search ────────────────────────────────
  try {
    const demoResult = await demoKBSearch(query);
    if (demoResult.steps.length > 0) {
      console.log(`[KB] ✓ Demo KB hit: "${demoResult.title}"`);
      return demoResult;
    }
  } catch (err) {
    console.warn(`[KB] Demo KB search failed (non-fatal): ${err.message}`);
  }

  console.log(`[KB] No results found for query`);
  return { steps: [], source: 'none', title: '' };
}

/**
 * Save a completed call to call_history.
 * Non-throwing — always safe to call.
 */
async function saveCallHistory(record) {
  try {
    const { error } = await supabase
      .from('call_history')
      .insert(record);
    if (error) console.warn(`[KB] saveCallHistory warning: ${error.message}`);
  } catch (err) {
    console.warn(`[KB] saveCallHistory error: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE: VECTOR SEARCH (real manuals)
// ─────────────────────────────────────────────────────────────────────────────
async function vectorSearch(query) {
  // Guard: skip silently if OpenAI key is not configured
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not set — skipping vector search');
  }

  // Step 1: Embed the query
  const embedding = await getEmbedding(query);

  // Step 2: Search Supabase via pgvector RPC
  const { data: chunks, error } = await supabase.rpc('search_manuals', {
    query_embedding: embedding,
    product_filter:  '',          // search all products
    match_count:     6,
  });

  if (error) throw new Error(error.message);
  if (!chunks || chunks.length === 0) return { steps: [], source: 'vector', title: '' };

  // Filter by minimum similarity threshold
  const relevant = chunks.filter(c => c.similarity > 0.72);
  if (relevant.length === 0) return { steps: [], source: 'vector', title: '' };

  // Step 3: Ask AI to structure the raw context into numbered steps
  const rawContext = relevant.map(c => c.content).join('\n\n---\n\n');
  const prompt = `Based on this product manual content, provide a clear step-by-step solution. Each step should be one actionable sentence. Issue: ${query}`;

  const structured = await getAIResponse(prompt, rawContext, {
    currentProduct: 'Geoteknik equipment',
  });

  const steps = parseSteps(structured);

  return {
    steps,
    source: 'manual',
    title : `Manual: ${relevant[0]?.product_name || 'Geoteknik Equipment'}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE: DEMO KB SEARCH (keyword-based, no embeddings needed)
// ─────────────────────────────────────────────────────────────────────────────
async function demoKBSearch(query) {
  const { data, error } = await supabase.rpc('search_demo_kb', {
    search_text: query,
    match_count: 1,
  });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { steps: [], source: 'demo', title: '' };

  const match = data[0];
  const steps = Array.isArray(match.steps)
    ? match.steps
    : JSON.parse(match.steps || '[]');

  return {
    steps,
    source: 'demo_kb',
    title : match.issue_title,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE: Parse AI output into clean step array
// ─────────────────────────────────────────────────────────────────────────────
function parseSteps(text = '') {
  // Try numbered list first: "1. Step text" or "Step 1: text"
  const numbered = text
    .split(/\n?\s*(?:\d+[\.\):]|Step\s+\d+[:\.])\s+/)
    .map(s => s.replace(/\n/g, ' ').trim())
    .filter(s => s.length > 15);

  if (numbered.length >= 2) return numbered;

  // Fall back to splitting on newlines
  return text
    .split('\n')
    .map(s => s.replace(/^[-•*]\s*/, '').trim())
    .filter(s => s.length > 15);
}

module.exports = { searchKnowledgeBase, saveCallHistory };