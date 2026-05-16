# Testing strategy — LEGO Collection Manager (MVP)

This strategy satisfies the [project rules](../.cursor/rules/project-rules.mdc): **no live external API calls** in automated tests; **pytest** for backend; **Vitest** (+ Testing Library) for frontend; **tests accompany every behavior change**.

## Principles

| Principle | Application |
|-----------|-------------|
| **Deterministic** | Fixed clocks where `fetched_at` matters; no network. |
| **Isolated DB** | Use file SQLite `:memory:` or `tmp_path` per test session/module as appropriate; migrations applied in fixture. |
| **Isolated images** | Image BLOB tests use in-memory SQLite and small PNG/JPEG fixtures in `tests/factories.py`; no filesystem upload directory. |
| **Contract fidelity** | Mocked Rebrickable payloads match **v3 JSON shapes** from official docs (trim fixtures to required keys only). |
| **Fast feedback** | Unit tests run without browser unless explicitly UI/integration. |

## Backend (pytest)

### CSV / text parsing

- Happy path: comma-separated tokens on one line and across newlines.
- No header: file is not interpreted as columnar CSV.
- UTF-8 edge cases (BOM optional handling documented in parser).
- Same `set_num` twice in one file → **two** `owned_sets` rows.
- Second import of same content → **additional** rows (additive).
- Malformed/empty tokens → errors array; valid tokens still processed.

### Importer mapping

- **Mock HTTP** with `httpx.MockTransport`, `pytest-httpx`, or `responses`—pick one library at implementation time and standardize.
- Table-driven tests: small JSON per endpoint → expected ORM field values for `catalog_sets`, `set_part_inventory_lines`, `minifig_part_inventory_lines`, `part_aliases`.
- Pagination: mock two pages with `next` link behavior to ensure the client exhausts all pages.

### Database models

- Constraint tests: uniqueness on catalog keys (`set_num`, `part_num`); **multiple** `owned_sets` per `catalog_set_id` allowed.
- FK integrity; CHECK behavior for `missing_items` line reference (if enforced in SQLite) or application-level validator tests.
- `investigated` defaults false on CSV-created and duplicated copies.

### API endpoints (FastAPI `TestClient`)

- `POST /imports/csv`: multipart upload, size limit, token errors shape, `instances_created` count.
- `POST /imports/rebrickable/sync`: success summary; per-set failure; missing API key.
- `GET /owned-sets`: pagination, `investigated` filter, multiple rows same `set_num`.
- `GET /owned-sets/{id}`, `PATCH /owned-sets/{id}`: investigation, label, age, notes; shared catalog fields (`catalog_name`, `catalog_theme_name`, `catalog_num_parts`, `catalog_year`); `catalog_theme_name` when `theme_id` is NULL (creates/links theme); `age` shared across copies of the same `set_num`; `set_num` re-link (single copy); `display_label` / `copy_index`; `catalog_set_id`, `part_id`, `part_image_url`, `missing_image_url` when BLOB present.
- `DELETE /owned-sets/{id}`: removes the copy and missing rows; catalog row remains when other copies exist.
- `GET /owned-sets/{id}/duplicate-preview`: `suggested_label` = `Copy #n`.
- `POST /owned-sets/{id}/duplicate`: `201` with label from body or default; `investigated` false; no `missing_items` on the new copy.
- `GET /search`: 400 on empty `q`; set mode returns distinct `owned_set_id` per physical copy.
- `PATCH .../missing`: validation against instance inventory quantity; clear with zero removes missing row (part BLOB unchanged unless DELETE image).
- `PUT` / `DELETE` missing image → part BLOB; `GET /media/missing/{id}` and `GET /parts/{id}/image`: 404 when absent; content-type for JPEG/PNG fixtures.
- `PUT` / `GET` / `DELETE` `/parts/{id}/image` and `/catalog-sets/{id}/image`: BLOB round-trip, size/MIME validation (`test_image_blob_api.py`).

### Post-MVP (Phases 9–13) and sync UX (**14**)

Still **no live Rebrickable** in CI.

| Phase | Status | Focus |
|-------|--------|--------|
| **9** | implemented | `PATCH .../inventory-lines/{instance_line_id}` isolation across two copies of the same `set_num`; `quantity_missing` validation (`test_instance_inventory_api.py`). |
| **10** | implemented | BLOB round-trip; 5 MB limit; JPEG/PNG only; part image visible on two sets (`test_image_blob_api.py`). |
| **11A** | implemented | `POST set-parts` returns `part_id`; `PATCH`/`DELETE set-parts`; detail `aliases`; image on add (mock `PUT`); `PartLineModal` Vitest. |
| **11B** | implemented | `PATCH /parts/{id}/aliases` symmetry; search by alias across class. |
| **12** | implemented | CSV import triggers mocked Rebrickable chain per token; inventory present without sync call; no image bytes written. |
| **13** | implemented | Backend: `test_manual_add_api.py`, `test_manual_add_rebrickable_draft.py`. Frontend: `AddSetPage.test.tsx` — new-catalog flow, optional **`parts`** in **`POST`**, mocked **`add-rebrickable-draft`** prefill. |
| **14** | implemented / partial | `POST /imports/rebrickable/sync`; Import-page **Sync entire collection**; set-detail current-set sync with `owned_set_ids`; image option request mapping for set, minifigure, set-part, and minifig BOM part images; mocked image download counters/failures. Progress/cancel, conflict policy, and arbitrary subset picker remain deferred — see [development-plan.md](./development-plan.md). |

### Search

- SQL/query layer tests for prefix match on `set_num` and match on `part_num` / `part_aliases.alias` with controlled fixtures.

### Missing item tracking

- Create set copies + inventory + missing rows; verify PATCH upsert/clear, image lifecycle, and detail endpoint aggregates.

## Frontend (Vitest + React Testing Library)

**Tooling:** `npm test` / `npm run test:watch` in `frontend/`. Setup and conventions: [frontend-testing.md](./frontend-testing.md).

| Area | Cases |
|------|--------|
| **Sets list** | `{display_label} — {set_num}`; metadata line (name, theme, parts, age defaults); filter; pagination; **Make a copy** opens modal → preview → POST on confirm. |
| **Set detail** | Per-copy fields (label, investigated, age, notes); **set number change** warning modal (Cancel / Continue); **delete** with confirm → `DELETE`; no duplicate button; inventory + missing UI. |
| **Search** | Debounce (if any), submit triggers correct API, displays multiple copies per `set_num` when applicable. |
| **Missing UI** | Changing missing quantity calls PATCH; upload calls PUT missing image endpoint; preview uses `part_image_url` / `missing_image_url`. |
| **Image UI** | Set detail uploads set/part images via `/catalog-sets/{id}/image` and `/parts/{id}/image`. |
| **Import** | File picker posts to CSV endpoint; success message reflects copy count (e.g. `instances_created` in JSON); **Sync entire collection** triggers sync endpoint (spinner / outcome messaging as implemented). |

**Mocking:** MSW (Mock Service Worker) or fetch mocks to return canned JSON aligned with [api-design.md](./api-design.md).

## Fixtures

| Location | Contents |
|----------|----------|
| `tests/fixtures/csv/` | `comma_separated.txt`, `duplicate_set_nums.txt`, `with_invalid_tokens.txt`, `multiline.txt`. |
| `tests/fixtures/rebrickable/` | `set_6024.json`, `parts_page1.json`, `parts_page2.json`, `minifigs.json`, `minifig_parts.json`, etc. |
| `tests/fixtures/images/` | Small valid JPEG/PNG for upload tests. |

Keep fixtures **small** and composable; regenerate from captured responses only after stripping private data (none expected for Rebrickable public metadata).

## Local smoke test (development)

For a sequential local check (backend install, `pytest`, `alembic upgrade head`, API health/CSV probe, frontend `npm test` + build), run [`./scripts/smoke.sh`](../scripts/smoke.sh). See [smoke-test.md](./smoke-test.md) and the [**smoke**](../.cursor/agents/smoke.md) agent.

## Continuous integration

The default pipeline is documented in [ci.md](./ci.md): on every **push** and **pull request**, GitHub Actions runs **backend `pytest`** and a **frontend `npm run build`** (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

- No secrets in CI; Rebrickable and other upstream HTTP remain **mocked** in tests.
- Frontend job runs `npm test` then `npm run build` (see [ci.md](./ci.md)).

## Definition of done (per change)

- Any production code change includes **new or updated tests** in the same PR.
- Importer or parser changes update fixtures when JSON assumptions change.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`
- [ci.md](./ci.md)
- [product-requirements.md](./product-requirements.md)
- [api-design.md](./api-design.md)
- [data-sources.md](./data-sources.md)
- [development-plan.md](./development-plan.md)
