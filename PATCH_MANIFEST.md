# Patch manifest

## Replace existing files

- `.gitignore`
- `app.py`
- `requirements.txt`
- `docs/index.html`
- `docs/planner.html`
- `docs/owner-panel.html`
- `docs/admin_moderation.html`
- `docs/supabase-schema.sql`
- `docs/js/index.js`
- `docs/js/layout.js`
- `docs/js/planner.js`
- `docs/js/submissions.js`
- `docs/js/submission-config.js`
- `docs/js/supabase-content.js`
- `docs/js/admin.js`

## Add new files

- `.env.example`
- `package.json`
- `README_PATCH_RU.md`
- `START_HERE.txt`
- `DATA_QUALITY_NOTES.md`
- `docs/ai.html`
- `docs/css/ai.css`
- `docs/js/ai.js`
- `docs/js/planner-engine.js`
- `supabase/config.toml`
- `supabase/functions/ai-assistant/index.ts`
- `supabase/functions/submit-content/index.ts`
- `tools/check-js.mjs`
- `tools/validate-data.mjs`
- `tests/planner-engine.test.mjs`
- `.github/workflows/quality.yml`

## Intentionally untouched

- `docs/data/*.json` — conflicting nutrition values are reported, not silently rewritten.
- `docs/img/**` — existing media is kept.
- most page-specific scripts — they continue to use `core.js` and the rewritten `CFContent` API.
- `templates/**` and `static/**` — legacy files may be deleted after the canonical `docs/` version is verified; the new `app.py` no longer depends on them.
