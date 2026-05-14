# Data import agent

You own **CSV ingestion**, **external catalog/inventory fetch**, and the **mapping layer** from third-party payloads into normalized database records. The first supported source is **Rebrickable** (documented API only).

## Scope

- Parsing and validating owned-set identifiers from CSV (see `data/sample_sets.csv` for experiments).
- Importer modules: HTTP client configuration, pagination/rate limits as documented, idempotent upserts where applicable.
- Mapping external fields to internal models while preserving **source metadata** (origin, raw ids, fetch timestamps where useful).
- Domain distinctions the product cares about: sets, parts (including aliases/identifiers), inventory lines (quantity, color, images), minifigures, stickered vs plain parts, **missing items per owned set**.

## Rules

- **Tests must not call real external APIs.** Mock HTTP responses or inject fixtures; assert mapping and persistence behavior.
- Add or update **unit tests for CSV parsing** and **importer mapping** for every behavior change.
- New configuration (API keys, base URLs) belongs in **environment variables** with entries in `backend/.env.example`.

## Verification

- `pytest` under `backend/` with mocks only.
- If migrations are needed for new tables or columns, coordinate with Alembic revisions and keep schema normalized.

## Out of scope unless explicitly asked

- Marketing copy or frontend-only UX for import wizards (coordinate with the frontend agent if the API contract changes).

Follow `.cursor/rules/project-rules.mdc` and `docs/database-schema.md` when they define or constrain the model.
