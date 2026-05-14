# Testing strategy — LEGO Collection Manager (MVP)

This strategy satisfies the [project rules](../.cursor/rules/project-rules.mdc): **no live external API calls** in automated tests; **pytest** for backend; **Vitest** (+ Testing Library) for frontend; **tests accompany every behavior change**.

## Principles

| Principle | Application |
|-----------|-------------|
| **Deterministic** | Fixed clocks where `fetched_at` matters; no network. |
| **Isolated DB** | Use file SQLite `:memory:` or `tmp_path` per test session/module as appropriate; migrations applied in fixture. |
| **Contract fidelity** | Mocked Rebrickable payloads match **v3 JSON shapes** from official docs (trim fixtures to required keys only). |
| **Fast feedback** | Unit tests run without browser unless explicitly UI/integration. |

## Backend (pytest)

### CSV parsing

- Happy path: header + rows, mixed valid/invalid.
- No header mode (if supported) or wrong header.
- UTF-8 edge cases (BOM optional handling decision documented in parser).
- Deduplication and idempotency assertions on `owned_sets` / stub `catalog_sets`.

### Importer mapping

- **Mock HTTP** with `httpx.MockTransport`, `pytest-httpx`, or `responses`—pick one library at implementation time and standardize.
- Table-driven tests: small JSON per endpoint → expected ORM field values for `catalog_sets`, `set_part_inventory_lines`, `minifig_part_inventory_lines`, `part_aliases`.
- Pagination: mock two pages with `next` link behavior to ensure the client exhausts all pages.

### Database models

- Constraint tests: uniqueness (`set_num`, `part_num`), FK integrity, CHECK behavior for `missing_items` line reference (if enforced in SQLite) or application-level validator tests.

### API endpoints (FastAPI `TestClient`)

- `POST /imports/csv`: multipart upload, size limit, partial errors shape.
- `POST /imports/rebrickable/sync`: success summary; per-set failure; missing API key.
- `GET /owned-sets`, `GET /owned-sets/{id}`: pagination, 404, nested `missing_quantity` aggregation correctness.
- `GET /search`: 400 on empty `q`; part vs set modes; only-owned filter for parts.
- `PATCH .../missing`: validation against inventory quantity; clear with zero.

### Search

- SQL/query layer tests for prefix match on `set_num` and match on `part_num` / `part_aliases.alias` with controlled fixtures.

### Missing item tracking

- Create owned set + inventory lines + missing rows; verify PATCH upsert/clear and that detail endpoint reflects aggregates.

## Frontend (Vitest + React Testing Library)

| Area | Cases |
|------|--------|
| **Owned sets list** | Renders rows from mocked API; pagination controls adjust query params or client state. |
| **Set detail** | Renders catalog header; inventory tables; minifig nested parts; spare/alternate labels. |
| **Search** | Debounce (if any), submit triggers correct API, displays split results for `type=all`. |
| **Missing UI** | Changing missing quantity calls PATCH with correct payload; optimistic or refetch behavior covered. |

**Mocking:** MSW (Mock Service Worker) or fetch mocks to return canned JSON aligned with [api-design.md](./api-design.md).

## Fixtures

| Location | Contents |
|----------|----------|
| `tests/fixtures/csv/` | `minimal.csv`, `with_duplicates.csv`, `with_errors.csv`. |
| `tests/fixtures/rebrickable/` | `set_6024.json`, `parts_page1.json`, `parts_page2.json`, `minifigs.json`, `minifig_parts.json`, etc. |

Keep fixtures **small** and composable; regenerate from captured responses only after stripping private data (none expected for Rebrickable public metadata).

## Continuous integration (optional MVP)

- Single workflow: install Python + Node, `pytest`, `vitest run`, lint (Ruff/ESLint) if configured.
- No secrets in CI; Rebrickable tests always mocked.

## Definition of done (per change)

- Any production code change includes **new or updated tests** in the same PR.
- Importer or parser changes update fixtures when JSON assumptions change.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`
- [product-requirements.md](./product-requirements.md)
- [api-design.md](./api-design.md)
- [data-sources.md](./data-sources.md)
- [development-plan.md](./development-plan.md)
