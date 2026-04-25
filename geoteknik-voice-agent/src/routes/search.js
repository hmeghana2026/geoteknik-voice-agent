const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
} else {
  console.warn('[search] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — /api/search-manual will return errors.');
}

function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 8);
}

function truncate(text, n = 600) {
  if (!text) return '';
  const s = String(text).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function searchManuals(query, product, limit) {
  const tokens = tokenize(query);
  let q = supabase
    .from('manuals')
    .select('id, product_name, section_title, content')
    .limit(limit);

  if (product) q = q.ilike('product_name', `%${product}%`);

  if (tokens.length) {
    // OR across content + section_title for each token
    const ors = tokens
      .flatMap((t) => [`content.ilike.%${t}%`, `section_title.ilike.%${t}%`])
      .join(',');
    q = q.or(ors);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row) => ({
    source: 'manual',
    product: row.product_name,
    title: row.section_title || null,
    snippet: truncate(row.content, 700),
  }));
}

async function searchDemoKb(query, product, limit) {
  const tokens = tokenize(query);
  let q = supabase
    .from('demo_kb')
    .select('id, product, issue_title, keywords, steps')
    .limit(limit);

  if (product) q = q.ilike('product', `%${product}%`);

  if (tokens.length) {
    // overlaps on keywords[] OR ilike on issue_title
    const ors = [
      `keywords.ov.{${tokens.join(',')}}`,
      ...tokens.map((t) => `issue_title.ilike.%${t}%`),
    ].join(',');
    q = q.or(ors);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row) => ({
    source: 'kb',
    product: row.product,
    title: row.issue_title,
    keywords: row.keywords,
    steps: row.steps,
  }));
}

// Score = number of distinct query tokens that appear in the row's text
function scoreResult(item, tokens) {
  const hay = [
    item.title || '',
    item.snippet || '',
    item.product || '',
    Array.isArray(item.keywords) ? item.keywords.join(' ') : '',
    item.steps ? JSON.stringify(item.steps) : '',
  ]
    .join(' ')
    .toLowerCase();
  let s = 0;
  for (const t of tokens) if (hay.includes(t)) s += 1;
  return s;
}

async function handleSearch(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured on server.' });
  }
  try {
    const { query, product, limit } = req.body || {};
    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'query is required' });
    }
    const cap = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 10);
    const tokens = tokenize(query);

    const [manuals, kb] = await Promise.all([
      searchManuals(query, product, cap),
      searchDemoKb(query, product, cap),
    ]);

    const merged = [...manuals, ...kb]
      .map((r) => ({ ...r, _score: scoreResult(r, tokens) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, cap)
      .map(({ _score, ...rest }) => rest);

    res.json({
      query,
      product: product || null,
      count: merged.length,
      results: merged,
    });
  } catch (err) {
    console.error('[search-manual] error', err);
    res.status(500).json({ error: err.message || 'search failed' });
  }
}

// POST is the primary endpoint (used by the Vapi tool call).
router.post('/search-manual', handleSearch);

// GET form for quick browser/curl testing: /api/search-manual?q=...&product=...
router.get('/search-manual', (req, res) => {
  req.body = {
    query: req.query.q || req.query.query,
    product: req.query.product,
    limit: req.query.limit,
  };
  return handleSearch(req, res);
});

module.exports = router;
