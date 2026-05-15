# Testing strategy — LEGO Collection Manager (MVP)

This strategy satisfies the [project rules](../.cursor/rules/project-rules.mdc): **no live external API calls** in automated tests; **pytest** for backend; **Vitest** (+ Testing Library) for frontend; **tests accompany every behavior change**.

## Principles

| Principle | Application |
|-----------|-------------|
| **Deterministic** | Fixed clocks where `fetched_at` matters; no network. |
| **Isolated DB** | Use file SQLite `:memory:` or `tmp_path` per test session/module as appropriate; migrations applied in fixture. |
| **Isolated uploads** | Point `UPLOAD_ROOT` at `tmp_path` per test; assert files created/removed with missing rows. |
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
- `investigated` defaults false on CSV-created and duplicated instances.

### API endpoints (FastAPI `TestClient`)

- `POST /imports/csv`: multipart upload, size limit, token errors shape, `instances_created` count.
- `POST /imports/rebrickable/sync`: success summary; per-set failure; missing API key.
- `GET /owned-sets`: pagination, `investigated` filter, multiple rows same `set_num`.
- `GET /owned-sets/{id}`, `PATCH /owned-sets/{id}`: investigation and label; nested `missing_image_url` when file present.
- `POST /owned-sets/{id}/duplicate`: `201` with new id; `investigated` false; no `missing_items` on new instance; source missing rows unchanged; `404` for unknown source.
- `GET /search`: 400 on empty `q`; set mode returns distinct `owned_set_id` per instance.
- `PATCH .../missing`: validation against inventory quantity; clear with zero removes row and image file.
- `PUT` / `DELETE` missing image; `GET /media/missing/{id}`: 404 when absent; content-type for JPEG/PNG fixtures.

### Search

- SQL/query layer tests for prefix match on `set_num` and match on `part_num` / `part_aliases.alias` with controlled fixtures.

### Missing item tracking

- Create owned instances + inventory + missing rows; verify PATCH upsert/clear, image lifecycle, and detail endpoint aggregates.

## Frontend (Vitest + React Testing Library)

| Area | Cases |
|------|--------|
| **Owned sets list** | Renders rows from mocked API; shows `investigated` state and `label`; filter param; pagination; duplicate action calls `POST .../duplicate`. |
| **Set detail** | Renders catalog header; investigation toggle; duplicate action; inventory tables; minifig nested parts; spare/alternate labels. |
| **Search** | Debounce (if any), submit triggers correct API, displays multiple instances per `set_num` when applicable. |
| **Missing UI** | Changing missing quantity calls PATCH; upload calls PUT image endpoint; preview uses `missing_image_url`. |
| **Import** | File picker posts to CSV endpoint; success message reflects instances created. |

**Mocking:** MSW (Mock Service Worker) or fetch mocks to return canned JSON aligned with [api-design.md](./api-design.md).

## Fixtures

| Location | Contents |
|----------|----------|
| `tests/fixtures/csv/` | `comma_separated.txt`, `duplicate_set_nums.txt`, `with_invalid_tokens.txt`, `multiline.txt`. |
| `tests/fixtures/rebrickable/` | `set_6024.json`, `parts_page1.json`, `parts_page2.json`, `minifigs.json`, `minifig_parts.json`, etc. |
| `tests/fixtures/images/` | Small valid JPEG/PNG for upload tests. |

Keep fixtures **small** and composable; regenerate from captured responses only after stripping private data (none expected for Rebrickable public metadata).

## Local smoke test (development)

For a sequential local check (backend install, `pytest`, `alembic upgrade head`, API health/CSV probe, frontend build), run [`./scripts/smoke.sh`](../scripts/smoke.sh). See [smoke-test.md](./smoke-test.md) and the [**smoke**](../.cursor/agents/smoke.md) agent.

## Continuous integration

The default pipeline is documented in [ci.md](./ci.md): on every **push** and **pull request**, GitHub Actions runs **backend `pytest`** and a **frontend `npm run build`** (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

- No secrets in CI; Rebrickable and other upstream HTTP remain **mocked** in tests.
- When Vitest is wired for the frontend, extend the workflow (and [ci.md](./ci.md)) with `npm test` or `vitest run` as agreed in this document.

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
