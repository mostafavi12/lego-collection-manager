# Data sources — LEGO Collection Manager (MVP)

This document defines **file** and **network** inputs: formats, environment variables, Rebrickable resources used, and mapping principles into the local database. It complements [product-requirements.md](./product-requirements.md) and [database-schema.md](./database-schema.md).

## CSV import (owned set numbers)

### Format

| Aspect | Rule |
|--------|------|
| **Encoding** | UTF-8 only. |
| **Delimiter** | Comma (`,`). |
| **Header row** | Optional. When present, the header must name the set column `set_num` (case-insensitive). |
| **Minimum column** | One column containing Rebrickable-compatible **set numbers** (`set_num`). |
| **Optional columns (post-MVP)** | `quantity`, `notes`, `purchase_date`, etc. are **not** required for MVP; if present, parsers may ignore them until specified in a later PRD revision. |

### Normalization

- Trim leading and trailing whitespace on every field.
- Empty `set_num` after trim → row error, skip row.
- **Case:** store and match using the canonical string returned by Rebrickable after first successful sync when possible; until sync, preserve user input trimmed.
- **Variants:** Rebrickable uses set numbers such as `6024-1`. User CSV values must be resolvable to the same `set_num` the API expects; if the API returns 404 for a row, surface that as a **sync-time** error for that set (see import API).

### Semantics

- Each non-duplicate row defines **ownership** of that catalog set (see `owned_sets` in [database-schema.md](./database-schema.md)).
- Re-importing the same file must not create duplicate owned-set rows for the same `set_num`.

## Rebrickable API

### Official documentation

- Base URL and versioning: **`https://rebrickable.com/api/v3/`** (HTTPS only).
- Human-readable API reference: [https://rebrickable.com/api/](https://rebrickable.com/api/)

Prefer documented endpoints only; do not rely on undocumented HTML scraping.

### Authentication

| Variable | Purpose |
|----------|---------|
| `REBRICKABLE_API_KEY` | API key sent with each request per Rebrickable’s documented auth scheme (typically an `Authorization` header or key query parameter—follow the official docs at implementation time). |

Rules:

- Never commit real keys; document `REBRICKABLE_API_KEY` in **`.env.example`** with a placeholder.
- Missing key → clear configuration error before any network call.

### MVP endpoint set

The following **REST** resources are in scope for MVP. Exact paths and query parameters must match the published Rebrickable v3 docs at implementation time.

| Resource (conceptual) | HTTP | Purpose | Populates / updates |
|------------------------|------|-----------|----------------------|
| Set metadata | `GET /lego/sets/{set_num}/` | Fetch one set’s catalog fields | `catalog_sets`, themes linkage |
| Set parts inventory | `GET /lego/sets/{set_num}/parts/` | Paginated parts in set with color, qty, spare, alt flags | `parts`, `part_aliases`, `colors`, `set_part_inventory_lines` |
| Set minifigs | `GET /lego/sets/{set_num}/minifigs/` | Minifigs included in set | `catalog_minifigs`, `set_minifig_inventory_lines` |
| Minifig parts | `GET /lego/minifigs/{minifig_num}/parts/` | BOM for one minifig | `parts`, `colors`, `minifig_part_inventory_lines` |
| Colors (optional batch) | `GET /lego/colors/` | Full color list for FK resolution and display | `colors` |
| Themes (optional) | `GET /lego/themes/{id}/` or list endpoint per docs | Theme name for display | `themes` or denormalized field on `catalog_sets` |

**Pagination:** Rebrickable list endpoints are paginated; the importer must follow `next` links or page cursors until exhaustion (per official response schema).

### Rate limits and etiquette

- Respect Rebrickable **rate limits** and terms of use documented on their site.
- Implementation should use conservative concurrency (MVP: **sequential** requests per set are acceptable), with optional exponential backoff on `429` / transient `5xx`.
- Log request failures with enough context for debugging (without logging secrets).

### Mapping principles (catalog → SQLite)

General rules (details in [database-schema.md](./database-schema.md)):

| Rebrickable concept | Storage rule |
|---------------------|--------------|
| `set_num` | Primary business key for `catalog_sets`; FK target for `owned_sets`. |
| `part` / `part_num` | Upsert `parts`; store `name`, `part_img_url` or equivalent as returned. |
| `color_id` | Upsert `colors`; FK on inventory lines. |
| Quantity, `is_spare`, `is_alternate` | Store on the appropriate inventory line table; include in uniqueness so spare vs non-spare lines do not collide. |
| Stickered vs plain | When Rebrickable uses different `part_num` values, store as **distinct** `parts` and distinct inventory lines—**no merging** in MVP. |
| Minifig `minifig_num` | Upsert `catalog_minifigs`; set-level minifig rows go to `set_minifig_inventory_lines`; BOM rows go to `minifig_part_inventory_lines`. |
| Aliases | When the API exposes alternate part IDs or legacy numbers, populate `part_aliases` so search remains accurate. |

### Source metadata

Every upserted row that originates from Rebrickable should set at least:

- `source` = `rebrickable`
- `source_ref` = stable external identifier (e.g. set_num, part_num, minifig_num) as appropriate
- `fetched_at` = UTC timestamp of successful write

Optional later: payload hash for change detection.

## Testing constraint

**All HTTP calls to Rebrickable must be mocked in automated tests.** Tests use fixture JSON aligned with the official response shapes; no real network calls. See [testing-strategy.md](./testing-strategy.md).

## Related documents

- [product-requirements.md](./product-requirements.md)
- [database-schema.md](./database-schema.md)
- [api-design.md](./api-design.md)
