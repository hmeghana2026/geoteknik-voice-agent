-- ============================================================
-- Geoteknik Voice Agent — Supabase Migration
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Enable pgvector (needed for manual embeddings search)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. demo_kb — seeded knowledge base for demo
-- ============================================================
CREATE TABLE IF NOT EXISTS demo_kb (
  id           BIGSERIAL PRIMARY KEY,
  product      TEXT NOT NULL,
  keywords     TEXT[] NOT NULL DEFAULT '{}',
  issue_title  TEXT NOT NULL,
  steps        JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demo_kb_product   ON demo_kb (product);
CREATE INDEX IF NOT EXISTS idx_demo_kb_keywords  ON demo_kb USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_demo_kb_fts       ON demo_kb
  USING GIN (to_tsvector('english', issue_title || ' ' || array_to_string(keywords, ' ')));

-- ============================================================
-- 3. call_history — stores completed call summaries
-- ============================================================
CREATE TABLE IF NOT EXISTS call_history (
  id             BIGSERIAL PRIMARY KEY,
  phone_number   TEXT,
  product_queried TEXT,
  summary        TEXT,
  email          TEXT,
  ticket_id      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. manuals — vector-embedded product manual chunks
-- ============================================================
CREATE TABLE IF NOT EXISTS manuals (
  id           BIGSERIAL PRIMARY KEY,
  product_name TEXT NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(1536),          -- OpenAI text-embedding-3-small
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manuals_product ON manuals (product_name);
-- HNSW index for fast approximate nearest-neighbor vector search
CREATE INDEX IF NOT EXISTS idx_manuals_embedding ON manuals
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 5. RPC: search_demo_kb
--    Called by knowledgeService.js with search_text + match_count
-- ============================================================
CREATE OR REPLACE FUNCTION search_demo_kb(
  search_text  TEXT,
  match_count  INT DEFAULT 3
)
RETURNS TABLE (
  id          BIGINT,
  product     TEXT,
  keywords    TEXT[],
  issue_title TEXT,
  steps       JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  normalized TEXT;
BEGIN
  normalized := lower(trim(search_text));

  -- Priority 1: full-text search on issue_title + keywords
  RETURN QUERY
    SELECT
      d.id,
      d.product,
      d.keywords,
      d.issue_title,
      d.steps
    FROM demo_kb d
    WHERE
      to_tsvector('english', d.issue_title || ' ' || array_to_string(d.keywords, ' '))
      @@ plainto_tsquery('english', search_text)
    ORDER BY
      ts_rank(
        to_tsvector('english', d.issue_title || ' ' || array_to_string(d.keywords, ' ')),
        plainto_tsquery('english', search_text)
      ) DESC
    LIMIT match_count;

  -- Priority 2: if nothing found, fall back to ILIKE on keywords + title
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT
        d.id,
        d.product,
        d.keywords,
        d.issue_title,
        d.steps
      FROM demo_kb d
      WHERE
        EXISTS (
          SELECT 1
          FROM unnest(d.keywords) AS k
          WHERE normalized LIKE '%' || k || '%'
             OR k LIKE '%' || normalized || '%'
        )
        OR lower(d.issue_title) LIKE '%' || normalized || '%'
      LIMIT match_count;
  END IF;
END;
$$;

-- ============================================================
-- 6. RPC: search_manuals
--    Called by knowledgeService.js for vector similarity search
-- ============================================================
CREATE OR REPLACE FUNCTION search_manuals(
  query_embedding vector(1536),
  product_filter  TEXT DEFAULT '',
  match_count     INT  DEFAULT 6
)
RETURNS TABLE (
  id           BIGINT,
  product_name TEXT,
  content      TEXT,
  similarity   FLOAT
)
LANGUAGE sql
AS $$
  SELECT
    id,
    product_name,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM manuals
  WHERE
    product_filter = ''
    OR product_name ILIKE '%' || product_filter || '%'
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- Done. Next steps:
--   1. node src/scripts/seedDemoKB-FIXED.js      (populate demo_kb)
--   2. node src/scripts/uploadManuals.js          (optional: embed PDFs/docs)
-- ============================================================
