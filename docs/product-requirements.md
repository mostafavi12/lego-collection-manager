# Product requirements — LEGO Collection Manager (MVP)

## Problem and goal

Collectors need a **local-first** way to record which LEGO sets they own, pull authoritative inventory data from documented online sources, and browse that data offline while tracking **missing parts per owned set**. The MVP delivers a small web application backed by **SQLite**, with data seeded from **CSV** and enriched via the **Rebrickable API**.

## Target user

A single user running the app on their own machine (no multi-tenant accounts in MVP).

## Engineering norms (repository)

**Stack, importer constraints, and automated-testing policy** are defined in the repository [project rules](../.cursor/rules/project-rules.mdc) (Cursor applies them across the tree). **How to run** the backend and frontend locally is in the root [`README.md`](../README.md).

**Product-level constraints (MVP):**

- **Single user** on one machine; no multi-tenant accounts (see [Non-goals](#non-goals-mvp)).
- **Local-first** persistence in SQLite; configurable `DATABASE_URL` (see [database-schema.md](./database-schema.md)).
- **Secrets:** API keys only via environment variables; document required variables in `backend/.env.example`; never commit real keys.

## Domain glossary

| Term | Definition |
|------|------------|
| **Catalog set** | Global LEGO set record (set number, name, year, theme, image URL, etc.) as imported from a source such as Rebrickable. |
| **Owned set** | The user’s ownership of exactly one catalog set (one row per owned instance in MVP; quantity of the same set is post-MVP unless specified elsewhere). |
| **Part** | A LEGO element type identified primarily by a part number; may have **aliases** (alternate identifiers). |
| **Color** | A color identifier and display name as provided by the importer (used on inventory lines). |
| **Set inventory line** | A row linking a catalog set to a part in a given color with quantity, optional image URL, and flags (e.g. spare, alternate) from the source. **Stickered** and **plain** variants are distinct lines when the source uses distinct part identities. |
| **Minifigure (catalog)** | A minifig design referenced by the source (e.g. `fig-…`); may appear as its own inventory line on a set and may have **constituent part** lines when the API exposes a minifig BOM. |
| **Missing item** | A user-tracked gap for a specific **owned set**: which part (and color) is missing, and in what quantity, relative to that set’s imported inventory. |

## MVP scope

### 1. CSV import of owned LEGO set numbers

**User outcome:** The user uploads or selects a CSV file; the app records which set numbers they own.

**Acceptance criteria:**

- CSV is **UTF-8**; first row may be a header (see [data-sources.md](./data-sources.md)).
- At minimum, a column providing Rebrickable-compatible **set numbers** is supported (`set_num`).
- Duplicate set numbers in one import are **deduplicated** with a clear summary in the response.
- Rows with empty or malformed `set_num` are rejected with **row-level errors**; valid rows still process if the implementation supports partial success (documented in API).
- Import is **idempotent** for ownership: re-importing the same set list does not create duplicate owned-set rows.

### 2. Rebrickable API import

**User outcome:** For owned sets (and their catalog metadata and inventories), the app fetches data from Rebrickable using an API key from the environment.

**Acceptance criteria:**

- Import requires `REBRICKABLE_API_KEY` (or the name agreed in [data-sources.md](./data-sources.md)); clear error if missing.
- Successful sync creates or updates **catalog** data (sets, parts, colors, inventory lines, minifigs as defined in [database-schema.md](./database-schema.md)).
- Each imported entity carries **source metadata** (at minimum: source name, external identifiers, last fetch timestamp).
- Re-running sync for the same owned sets **updates** existing catalog rows where data changed; does not duplicate primary catalog entities.
- Failures from the API (network, 4xx/5xx) surface as actionable errors without corrupting existing rows (transaction boundaries described in [api-design.md](./api-design.md)).

### 3. SQLite storage

**User outcome:** All collection and catalog data persist in a single local SQLite database file.

**Acceptance criteria:**

- Database path is configurable (environment variable); sensible default for local dev documented in [development-plan.md](./development-plan.md).
- Schema is versioned with **Alembic** migrations.
- Application starts only if migrations can be applied or the database is at the expected revision.

### 4. Owned sets list

**User outcome:** A screen lists every owned set with enough context to recognize it (set number, name, year, thumbnail if available).

**Acceptance criteria:**

- List is **paginated** (offset/limit) per [api-design.md](./api-design.md).
- Rows link to the **set detail** view.
- Sets without a successful catalog sync yet appear as owned with **placeholder or partial** display until sync completes (behavior explicitly stated in API responses).

### 5. Set detail page with parts

**User outcome:** Selecting an owned set shows catalog metadata plus the full **parts inventory** (including colors, quantities, images where available). Minifigures appear consistently with how Rebrickable models them (as inventory lines and/or expandable BOM when available).

**Acceptance criteria:**

- Detail view includes theme, year, name, set number, and image when present.
- Inventory table supports sorting or stable default order (e.g. by part number, then color).
- Spare and alternate lines from the source are visible or filterable (MVP: visible with labels is sufficient).
- Distinct **stickered vs plain** parts appear as distinct rows matching importer data.

### 6. Search by set number and part number

**User outcome:** The user can find owned sets or catalog parts by typing a set number or part number (or alias).

**Acceptance criteria:**

- Search returns **owned sets** when matching set numbers (including normalized forms agreed in [data-sources.md](./data-sources.md)).
- Search returns **parts** that appear in the user’s owned sets’ inventories when matching part number or a stored **alias**.
- Empty query returns a **validation error** (400), not a full dump.
- Response time remains acceptable on a typical personal library (thousands of parts); indexes defined in [database-schema.md](./database-schema.md).

### 7. Missing part tracking

**User outcome:** From an owned set’s inventory, the user marks parts (per color) as missing, adjusts quantities, and clears them when found.

**Acceptance criteria:**

- Missing state is stored **per owned set**, not globally.
- User cannot mark missing more than the **expected quantity** from inventory for that part/color (validation).
- UI and API expose current missing lines and remaining “complete” status at a glance for that owned set.
- Clearing missing removes or zeroes the corresponding records without deleting catalog inventory.

## UX surfaces (MVP)

1. **Owned sets** — list + pagination.
2. **Set detail** — metadata + inventory + **missing** panel.
3. **Search** — single entry point or dual mode (set vs part) per API design.
4. **Import** — CSV upload; trigger Rebrickable sync (from owned list or global import action).

## Non-goals (MVP)

- Multi-user authentication, roles, or hosted SaaS deployment requirements.
- Cloud sync, backup, or merge across devices.
- BrickLink, BrickOwl, or other marketplaces; pricing or availability.
- Native mobile apps.
- Hosting user-uploaded images (MVP uses **URLs** returned by the importer only).
- Advanced analytics, wish lists, or part-out planning.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`.
- [data-sources.md](./data-sources.md) — CSV and Rebrickable contracts.
- [database-schema.md](./database-schema.md) — tables and relationships.
- [api-design.md](./api-design.md) — REST endpoints and payloads.
- [development-plan.md](./development-plan.md) — delivery phases.
- [testing-strategy.md](./testing-strategy.md) — verification approach.
