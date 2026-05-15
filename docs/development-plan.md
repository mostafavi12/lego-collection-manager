# Development plan — LEGO Collection Manager (MVP)

Ordered phases from an empty repo to a shippable MVP, aligned with the [project rules](../.cursor/rules/project-rules.mdc) and the documents in this folder.

## Phase 1 — Tooling and skeleton

**Deliverables**

- Python **3.12+** project layout under `backend/` (FastAPI application factory, dependency injection for DB session).
- `frontend/` scaffold: **React**, **TypeScript**, **Vite**, router, API client base URL from env.
- `backend/.env.example`: `DATABASE_URL`, `REBRICKABLE_API_KEY`, `VITE_API_BASE_URL`, CORS-related vars as needed. (MVP also used `UPLOAD_ROOT` for disk missing photos; **Phase 10** moved images into SQLite BLOBs.)
- `.gitignore` excludes `.env`, SQLite files under `data/` if desired, upload directory contents, and virtualenvs.

**Exit criteria**

- `uvicorn` (or documented equivalent) serves health check `GET /health` → `200`.
- Vite dev server runs and can call the backend health endpoint without CORS errors.

## Phase 2 — Database

**Deliverables**

- SQLAlchemy models matching [database-schema.md](./database-schema.md) (including `owned_sets.investigated`, `owned_sets.label`, non-unique `catalog_set_id`, `missing_items.image_path`).
- Alembic initialized; initial migration creates all MVP tables and indexes.
- Configurable `DATABASE_URL` with default SQLite path documented in `backend/.env.example`.

**Exit criteria**

- Fresh DB migrates to head without manual SQL.
- Model-level constraints match the schema doc (FKs; **no** unique constraint on `owned_sets.catalog_set_id`).

## Phase 3 — CSV pipeline

**Deliverables**

- Text parser per [data-sources.md](./data-sources.md): comma- and whitespace-separated set numbers, **no header**, UTF-8.
- Service that creates **stub** `catalog_sets` when needed and **inserts one new** `owned_sets` row per valid token (`investigated` = false).
- `POST /imports/csv` per [api-design.md](./api-design.md) (additive semantics).

**Exit criteria**

- Duplicate `set_num` in one file creates **multiple** `owned_sets` rows.
- Token-level errors reported without aborting valid tokens (unless zero valid tokens).
- Second upload of the same file creates **additional** instances (documented behavior).

## Phase 4A — Rebrickable HTTP client

**Deliverables**

- HTTP client module under `backend/app/rebrickable/` (timeouts, retries/backoff for `429`/`5xx` as minimal courtesy).
- JSON → **DTO** mappers (sets, themes, colors, parts, set-part lines, minifigs, minifig BOM lines).
- Pagination via Rebrickable `next` links; auth via `REBRICKABLE_API_KEY` (`Authorization: key …`).
- Fixture-based tests with **mocked HTTP only** (no live API in CI).

**Exit criteria**

- Client methods return stable DTOs from fixture JSON.
- Missing API key raises a clear configuration error before any network call.
- Multi-page list endpoints are exhausted in tests (mock `next`).

## Phase 4B — Rebrickable sync service

**Deliverables**

- DTO → ORM upsert mappers (sets, themes, colors, parts, aliases, all inventory line types).
- Orchestration service: for each owned set (by distinct `set_num` or per `owned_set_id` scope in API), fetch via the Phase 4A client (set metadata, parts, minifigs, then each minifig’s BOM); upsert with **source metadata**.
- `POST /imports/rebrickable/sync` synchronous implementation per [api-design.md](./api-design.md).

**Exit criteria**

- Second sync run updates `fetched_at` and replaces inventory for that catalog set without duplicate line rows (natural keys respected).
- Missing API key returns `400` with clear message.

## Phase 5 — Read APIs

**Deliverables**

- `GET /owned-sets` with pagination, optional `investigated` filter, `catalog_sync_state` / `missing_count` / `label` fields.
- `GET /owned-sets/{id}` returning instance metadata, catalog block, nested inventories, per-line `missing_quantity` / `missing_item_id` / `missing_image_url`.
- `PATCH /owned-sets/{id}` for `investigated` and `label`.
- `POST /owned-sets/{id}/duplicate` — new instance, `investigated` false, no missing rows copied.
- `GET /search` per [api-design.md](./api-design.md) (multiple instances per `set_num` in set results).

**Exit criteria**

- `404` for unknown owned set id.
- Duplicate returns `201` with new `id`; source instance unchanged; new row has `investigated` false and `missing_count` 0.
- Search rejects empty `q` with `400`.

## Phase 6 — Missing parts API and local images

**Deliverables**

- `PATCH /owned-sets/{id}/missing` implementing upsert/clear rules and quantity validation.
- `PUT` / `DELETE` missing-part image endpoints; `GET /media/missing/{missing_item_id}`; files under `UPLOAD_ROOT`. *(Superseded by Phase 10 BLOB storage — see Phase 10.)*

**Exit criteria**

- Cannot persist `quantity_missing` greater than the referenced inventory line’s `quantity`.
- Clearing with `quantity_missing: 0` removes the missing row and any image file.
- Upload replaces prior file; delete image leaves missing quantity unchanged.

## Phase 7 — Frontend MVP UI

**Deliverables**

- **Owned sets list** page with pagination, investigation badge, optional filter, labels for duplicate `set_num`.
- **Set detail** page: metadata, investigation toggle, label edit, **add another copy**, inventory tables, **missing** panel with quantity controls and **per-line photo upload/preview**.
- **Owned sets list:** **add another copy** action per row.
- **Search** UI (single field; tabs or toggle for set vs part optional).
- **Import** UI: file picker for comma-separated set list; button to trigger Rebrickable sync.

**Exit criteria**

- End-to-end manual flow: CSV (additive) → sync → duplicate an owned set from UI → new uninvestigated copy → mark missing + upload photo → reload shows persisted state and local image.

## Phase 7b — Instance management UX (feedback) — **complete**

**Deliverables**

- Schema: `owned_sets.age` (INTEGER NULL) + Alembic migration; Rebrickable age strings (`6+`) parsed to integer on sync.
- Shared-field PATCH (e.g. age → all instances); `set_num` change with instance-only re-link + UI warning.
- DELETE removes catalog + inventory when last instance for that catalog set is removed.
- API: `copy_index` / `display_label` on list and detail; `PATCH` adds `age` and `notes`; `DELETE /owned-sets/{id}`; `GET .../duplicate-preview` + `POST .../duplicate` with optional `label` body.
- Frontend: list layout (`{display_label} — {set_num}`, metadata line); rename **Make a copy** + confirmation modal; remove duplicate from detail; instance editor on detail; delete with confirmation.

**Exit criteria**

- List shows label before set number and name/theme/parts/age with documented defaults.
- Make a copy only from list; dialog shows set number X and default `Copy #n`; create only after confirm.
- Detail allows editing instance fields and deleting the instance; no Make a copy on detail.
- Tests cover delete, duplicate preview/POST with label, PATCH age, PATCH theme when `theme_id` is NULL, and updated list/detail UI (mocked API).

**Follow-up (post-merge):** theme PATCH when catalog had no linked theme (CSV stubs); dual-source metadata documented in [data-sources.md](./data-sources.md#catalog-metadata-dual-source).

## Phase 8 — Hardening and documentation — **complete**

**Deliverables**

- Structured logging for importer (no secrets); `LOG_LEVEL` in `.env.example`.
- Startup migration gate: API fails fast unless DB is at Alembic head (`SKIP_DB_MIGRATION_CHECK` for tests).
- README sections: prerequisites, how to run backend/frontend, migrations, `DATABASE_URL`, configuration table.
- GitHub Actions CI on push/PR: backend `pytest`, frontend `npm test`, and `npm run build` (see [ci.md](./ci.md), [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

**Exit criteria**

- New developer can run the stack from README alone.
- No committed secrets; `backend/.env.example` complete.
- GitHub Actions workflow (see [ci.md](./ci.md)) runs on push and pull request.

---

## Post-MVP overview (Phases 9–13; sync baseline **14a**)

Phases **1–8** delivered the original MVP (including Rebrickable sync endpoint and disk-based missing photos). Phases **9–13** refactor collection semantics around:

- **Rebrickable as the catalog source** (metadata + full inventory, **no image downloads** from the API).
- **Every catalog set has at least one owned instance** — there is no “catalog-only” set the user does not own.
- **Per-instance inventory** (part quantities and missing counts), while **set-level metadata** and **part-level images/aliases** follow the sharing rules in [product-requirements.md §11](./product-requirements.md#11-post-mvp-collection-semantics-phases-914).
- **Images in SQLite** (JPEG/PNG BLOBs), not on disk under `MEDIA_ROOT` / thumbnails.
- **Sync UX:** **Phase 14a** ships **Import → Sync all owned sets** (`POST /imports/rebrickable/sync` with no body); the API accepts optional **`owned_set_ids`** for scoped sync (**UI not built**). **Phase 14b** covers subset UX, progress/cancel, conflicts, and optional CDN→BLOB backfill (see Phase **14** below).

Implement **one phase at a time**; update [database-schema.md](./database-schema.md), [api-design.md](./api-design.md), and tests before marking a phase complete.

## Phase 9 — Instance inventory and editing — **complete**

**Goal:** Quantities and missing counts are **per owned-set instance**, not shared on catalog inventory lines.

**Deliverables**

- Schema: instance-scoped inventory (e.g. `owned_set_inventory_lines` linking `owned_set_id` to a catalog inventory line key — set-part or minifig-part — with `quantity` and optional denormalized keys for queries). Catalog lines (`set_part_inventory_lines`, etc.) remain the **template** populated from Rebrickable; each new instance gets instance rows copied from the catalog template (duplicate and CSV/manual flows).
- APIs: `PATCH` (or dedicated endpoints) to update **instance** `quantity` and `quantity_missing` per line; validation `0 ≤ quantity_missing ≤ quantity`.
- Migrate existing `missing_items` to align with instance inventory (or fold missing quantity into instance lines and deprecate separate missing row where redundant — document chosen model in schema).
- Frontend: set detail inventory table edits **this copy’s** quantities and missing counts; shared catalog fields unchanged in behavior from Phase 7b.
- Tests: per-instance isolation (editing Copy #1 does not change Copy #2); validation; duplicate creates fresh instance lines with template quantities.

**Exit criteria**

- Two instances of the same `set_num` can have different part quantities and missing counts.
- Editing set name/theme/year/age/set image on one instance still updates **all** instances of that `set_num` (unchanged from MVP).
- All backend tests pass; no live Rebrickable calls.

## Phase 10 — Images in database (parts and sets) — **complete**

**Goal:** Store user and optional catalog images as **BLOBs in SQLite**; remove reliance on `UPLOAD_ROOT` / filesystem for product images.

**Deliverables**

- Schema: BLOB + `content_type` (+ optional `byte_size`) on `parts` for **part image** (global: one image per part, shown in every set that uses that part). BLOB on `catalog_sets` for **set box image** (shared across all instances of that set). Drop or migrate away `missing_items.image_path` and disk storage; missing lines use the **part** image when present, or instance-line-specific upload if spec’d separately (default: upload attaches to `parts` when the line’s part is identified).
- APIs: `PUT` / `GET` / `DELETE` image endpoints for parts and sets; max **5 MB**, min **0** bytes allowed; JPEG and PNG only.
- Remove `UPLOAD_ROOT` from required config (or keep only for legacy migration script). No `MEDIA_ROOT`, thumbnails, or CDN cache folders.
- Optional: stop persisting Rebrickable `image_url` on new fetches if redundant (not required for exit).
- Frontend: upload/preview on inventory lines (emphasis on missing parts); set image edit on detail (shared).
- Tests: round-trip upload/serve/delete; size and MIME validation; part image visible on two sets sharing `part_id`.

**Exit criteria**

- Missing-part photo survives DB backup/restore without a separate upload directory.
- Replacing a part image updates display for that part in **all** sets in the UI.
- Disk upload directory is not required for normal operation.

## Phase 11A — Inventory part modal (add / edit / delete)

**Goal:** Unified **PartLineModal** for set-parts inventory: add with optional image, click row to edit or delete, show aliases read-only in the table.

**Deliverables**

- APIs: extend `POST /owned-sets/{id}/set-parts` **201** with `part_id` and `catalog_line_id`; add `PATCH` and `DELETE` on `.../set-parts/{instance_line_id}` (see [api-design.md](./api-design.md)).
- Detail payload: `SetPartLineDetail.aliases` (read-only strings from `part_aliases`, excluding `part_num`).
- Frontend: replace `AddPartLineDialog` with `PartLineModal` (`create` | `edit`); row click opens edit (**Update** / **Delete** / **Cancel**); optional image on add via existing `PUT /parts/{part_id}/image` after create; remove inline `PartImageEditor` from table (modal is primary).
- `PATCH .../inventory-lines/{id}` remains for **missing quantity** inline editor; modal uses set-parts PATCH for line metadata and instance quantity.
- Tests: set-parts CRUD; detail includes aliases; image-on-add flow (mocked PUT); modal Vitest.

**Exit criteria**

- User can add a part with optional photo; photo appears for that `part_id` everywhere.
- Clicking a set-part row opens edit modal; delete removes instance line and orphan catalog line when unused.
- Table shows alias identifiers (read-only).
- No live Rebrickable in tests.

## Phase 11B — Part alias editing in modal

**Goal:** Edit part aliases in the same **PartLineModal** using symmetric equivalence classes (PRD §11.5).

**Deliverables**

- API: `PATCH /api/parts/{part_id}/aliases` with replace-list body `{ "aliases": [...] }` and server-side closure (see [api-design.md](./api-design.md)).
- Service: `part_alias_service.replace_aliases` — manual rows use `source='user'`; merge classes when an alias string links to another part (documented policy).
- Frontend: **AliasChipEditor** in create and edit modals; submit order: create — `POST set-parts` → `PATCH aliases` → `PUT image`; edit — `PATCH set-parts` → `PATCH aliases` → image as needed.
- Tests: symmetry property tests (add B to X ⇒ X on B; remove A from X ⇒ X removed from A); search by alias across class.

**Exit criteria**

- Alias chip editor works in add and edit modals.
- Undirected alias group stays consistent after edits.
- Search finds parts by any alias in the class.

## Phase 12 — CSV import with full Rebrickable fetch (no images)

**Goal:** CSV import creates instances **and** loads full catalog + inventory from Rebrickable per token — **without** downloading images.

**Deliverables**

- `POST /imports/csv`: after each valid token, call Rebrickable (set metadata, set parts, minifigs, minifig BOMs) using the Phase 4A client; upsert catalog + template inventory; create instance rows from template (Phase 9). **Do not** HTTP-fetch `part_img_url` / set image URLs into files or BLOBs.
- Replace **stub-only** catalog creation: new sets get name, theme, year, `num_parts`, **age only when Rebrickable returns `age_range`**, and full part/minifig lists when the API succeeds; per-token failures reported without aborting other tokens (same partial-success pattern as today). Manual age entry on set detail when the API has no age.
- Requires `REBRICKABLE_API_KEY`; clear error if missing.
- Frontend: Import page copy explains that CSV adds instances and fetches set data (no images). **Sync all** remains on Import (**Phase 14a** baseline); fancier scoped sync is **Phase 14b**.
- Tests: mocked multi-endpoint Rebrickable sequence per token; assert inventory row counts; assert no image BLOBs/URLs written when policy is “no images on import.”

**Exit criteria**

- Importing `6024-1` via CSV yields a browsable set detail with full part list (from fixtures/mocks in CI) without running `POST /imports/rebrickable/sync`.
- Second CSV with same `set_num` creates a **second instance** with its own instance inventory rows.
- No filesystem image cache created during import.

## Phase 13 — Manual add set wizard

**Goal:** User can add a set by number only; branch on whether `set_num` already exists; support manual catalog entry and (via API or set detail) initial inventory. **Part alias editing** is Phase **11B**, not this phase.

**Deliverables (original spec)**

- **Add set wizard (frontend):**
  1. Modal/page with single required field: **LEGO set number**.
  2. If `set_num` **exists**: inform user they are creating a **new instance**; load shared catalog + template inventory from DB; create instance (`investigated` false); navigate to detail for instance-level edits.
  3. If `set_num` **new**: set metadata (name, theme, year, `num_parts`, age); optional parts list UI and optional **Fetch from Rebrickable** button in wizard; formal confirm-only step optional.

**Implementation status — core complete**

- **`GET /owned-sets/add-preview`**, **`POST /owned-sets`**, and **`AddSetWizard`** (modal from owned-sets list, `/add` route, Import page link): **implemented** (see [`backend/tests/test_manual_add_api.py`](../backend/tests/test_manual_add_api.py); wizard Vitest in `frontend/src/pages/AddSetPage.test.tsx`).
- **Existing catalog branch:** Messaging, read-only catalog summary + suggested label + template parts preview table; POST with `set_num` + optional `label` only.
- **New catalog branch:** User can submit optional **`catalog`** + **`age`** + **`label`**; creates `source=user` catalog and first owned instance; instance inventory cloned from template (possibly empty).

**Deferred / optional (wizard polish)**

- **Part lines in wizard:** `POST /owned-sets` accepts `parts[]` for net-new catalogs, but **`AddSetWizard` does not render a part-row editor** today — users add inventory via **PartLineModal** on set detail, **`POST /owned-sets` with JSON**, CSV import (**Phase 12**), or Rebrickable sync (**Phase 14a** baseline).
- **“Fetch from Rebrickable”** inside wizard for brand-new sets: not wired; **Phase 12** import is the preferred path when Rebrickable data is desired without manual parts entry.
- **Dedicated third confirm step:** not implemented (two steps + Submit is acceptable).

**Collection invariant**

- Deleting the last instance for a `set_num` deletes catalog + inventory for that set (existing rule); no orphan `catalog_sets` without `owned_sets`.

**Exit criteria (adjusted to shipped behavior)**

- User can create a **new** `set_num` from the wizard with optional catalog metadata; first inventory lines can be added **on detail** (or CSV / sync / raw API `parts`).
- User can create **another copy** of an existing `set_num` via wizard after entering the number (preview → Add), or use **Make a copy** on the list.
- Automated tests cover **`add-preview` + `POST`** branching; frontend covers wizard happy path(s) with mocks.

---

## Phase 14 — Sync UX and polish (split)

### Phase 14a — Bulk sync baseline (**done**)

- **`POST /imports/rebrickable/sync`** unchanged; **Import** page exposes **Sync all owned sets** (empty body syncs entire collection).
- Request body **`{ "owned_set_ids": […] }`** is supported server-side for **scoped** sync; **no frontend UI** exposes selection yet.

### Phase 14b — Deferred backlog

- UX to pick **subset** of owned instances / current-set sync from detail.
- **Progress**, **cancel**, and long-running-job messaging beyond a simple spinner on Import.
- **Conflict / refresh policies** when Rebrickable data differs from manual edits (document and enforce UX).
- **Optional image backfill**: HTTP-fetch CDN URLs into BLOBs.

See [api-design.md](./api-design.md) for sync contract. Phase **12** (CSV fetch) reduces need for wizard-only Rebrickable prefill for common flows.

## Dependency graph (high level)

```mermaid
flowchart LR
  subgraph mvp [MVP Phases 1-8]
    phase1[Phase1_Tooling]
    phase2[Phase2_DB]
    phase3[Phase3_CSV]
    phase4a[Phase4A_Client]
    phase4b[Phase4B_Sync]
    phase5[Phase5_ReadAPI]
    phase6[Phase6_MissingAPI]
    phase7[Phase7_Frontend]
    phase8[Phase8_Hardening]
    phase1 --> phase2
    phase2 --> phase3
    phase2 --> phase4a
    phase3 --> phase4a
    phase4a --> phase4b
    phase4b --> phase5
    phase5 --> phase6
    phase5 --> phase7
    phase6 --> phase7
    phase7 --> phase8
  end
  subgraph post ["Post-MVP Phases 9-13 (+ 14a sync)"]
    phase9[Phase9_InstanceInventory]
    phase10[Phase10_ImagesInDB]
    phase11A[Phase11A_PartModal]
    phase11B[Phase11B_Aliases]
    phase12[Phase12_CSVFetch]
    phase13[Phase13_ManualAddWizard]
    phase9 --> phase10
    phase10 --> phase11A
    phase11A --> phase11B
    phase11B --> phase12
    phase12 --> phase13
  end
  phase8 --> phase9
  phase4a --> phase12
```

**Note:** Phase 12 (CSV fetch) depends on Phase 4A (client) and Phase 9 (instance rows). Phases 11A–11B depend on Phase 10 (part image BLOBs). Phase 10 can proceed after Phase 9 so missing/part uploads target BLOB columns. Phase **12** overlaps with wizard Rebrickable prefill; prefer CSV when full catalog/inventory from Rebrickable is desired in one flow.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`
- [ci.md](./ci.md)
- [product-requirements.md](./product-requirements.md)
- [testing-strategy.md](./testing-strategy.md)
