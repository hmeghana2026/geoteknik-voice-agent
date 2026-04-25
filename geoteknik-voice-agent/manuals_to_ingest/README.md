# Manuals to Ingest

Drop product manual PDFs into this folder, then run from the `geoteknik-voice-agent` directory:

```bash
npm run ingest:pdf -- --file ./manuals_to_ingest/<your-file>.pdf --product "<Product Name>"
```

Useful flags:
- `--dry` — preview chunks without writing to the database.
- `--chunk 1500 --overlap 200` — tune chunk size.

The script splits the PDF into searchable chunks and inserts one row per chunk
into the Supabase `manuals` table (columns: `product_name`, `section_title`, `content`).
