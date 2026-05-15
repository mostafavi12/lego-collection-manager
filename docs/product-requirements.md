# Product requirements — LEGO Collection Manager (MVP)

## Problem and goal

Collectors need a **local-first** way to record which LEGO sets they own (including **multiple physical copies** of the same set number), pull authoritative inventory data from documented online sources, and browse that data offline while tracking **missing parts per owned copy** and whether each copy has been **investigated** after purchase (common for second-hand sets). The MVP delivers a small web application backed by **SQLite**, with collection growth via **repeatable CSV imports**, **duplicating an existing owned set** when another physical copy is purchased, and catalog enrichment via the **Rebrickable API**.

## Target user

A single user running the app on their own machine (no multi-tenant accounts in MVP), often acquiring **second-hand** sets that may be incomplete until manually checked against the imported inventory.

## Engineering norms (repository)

**Stack, importer constraints, and automated-testing policy** are defined in the repository [project rules](../.cursor/rules/project-rules.mdc) (Cursor applies them across the tree). **How to run** the backend and frontend locally is in the root [`README.md`](../README.md).

**Product-level constraints (MVP):**

- **Single user** on one machine; no multi-tenant accounts (see [Non-goals](#non-goals-mvp)).
- **Local-first** persistence in SQLite; configurable `DATABASE_URL` (see [database-schema.md](./database-schema.md)).
- **Secrets:** API keys only via environment variables; document required variables in `backend/.env.example`; never commit real keys.
- **User media:** missing-part photos are stored **on disk** beside the database so reports and browsing work **offline** after upload (see [database-schema.md](./database-schema.md) and [api-design.md](./api-design.md)).

## Domain glossary

| Term | Definition |
|------|------------|
| **Catalog set** | Global LEGO set record (set number, name, year, theme, image URL, etc.) as imported from a source such as Rebrickable. One row per `set_num`. |
| **Owned set (instance)** | One **physical copy** the user owns of a catalog set. The same `set_num` may appear as **many** owned-set rows (complete, incomplete, or not yet investigated). |
| **Investigated** | A boolean on each owned-set instance: the user has manually checked that copy against its imported inventory (typical after buying second-hand). Uninvestigated copies remain flagged until the user marks them investigated. |
| **Instance label** | Optional text on an owned-set row to distinguish copies. When unset, the UI displays **`Copy #n`** where `n` is the copy index for that `set_num` (1-based among instances, oldest first). |
| **Instance age** | Integer on each owned-set row (e.g. `6` from Rebrickable `6+`). Shown as `?` when unset. Editing age on one instance updates **all** instances of the same catalog set. |
| **Part** | A LEGO element type identified primarily by a part number; may have **aliases** (alternate identifiers). |
| **Color** | A color identifier and display name as provided by the importer (used on inventory lines). |
| **Set inventory line** | A row linking a catalog set to a part in a given color with quantity and optional image URL. Rebrickable spare and alternate rows are ignored on import. **Stickered** and **plain** variants are distinct lines when the source uses distinct part identities. |
| **Minifigure (catalog)** | A minifig design referenced by the source (e.g. `fig-…`); may appear as its own inventory line on a set and may have **constituent part** lines when the API exposes a minifig BOM. |
| **Missing item** | A user-tracked gap for a specific **owned-set instance**: which part (and color) is missing, in what quantity, and optionally **one user-provided photo** stored locally for offline reference and future reports. |

## MVP scope

### 1. CSV import of owned LEGO set numbers

**User outcome:** The user uploads a simple text file listing set numbers (comma-separated, no header). Each import **adds** new owned-set instances to the collection so they can record newly purchased second-hand sets at any time.

**Acceptance criteria:**

- File format matches [data-sources.md](./data-sources.md): **UTF-8**, **no header row**, **no columns** — only Rebrickable-compatible **set numbers** separated by commas (whitespace and newlines around tokens are ignored).
- **Each token** in the file creates **one new** `owned_sets` row, even when the same `set_num` appears multiple times in the file or already exists in the collection (multiple physical copies).
- Malformed tokens (empty after trim, invalid characters per parser rules) are reported as **token-level errors**; valid tokens still process when partial success is supported (documented in API).
- Import is **additive**: it does not delete or replace existing owned instances. Re-uploading the same file creates **additional** copies (user responsibility).
- Response summarizes **instances created**, stub catalog rows created, and errors.

### 2. Rebrickable API import

**User outcome:** For owned sets (and their catalog metadata and inventories), the app fetches data from Rebrickable using an API key from the environment.

**Acceptance criteria:**

- Import requires `REBRICKABLE_API_KEY` (or the name agreed in [data-sources.md](./data-sources.md)); clear error if missing.
- Successful sync creates or updates **catalog** data (sets, parts, colors, inventory lines, minifigs as defined in [database-schema.md](./database-schema.md)).
- Each imported entity carries **source metadata** (at minimum: source name, external identifiers, last fetch timestamp).
- Re-running sync for the same owned-set instances **updates** shared catalog rows and inventory for the underlying `set_num`; does not duplicate primary catalog entities.
- Failures from the API (network, 4xx/5xx) surface as actionable errors without corrupting existing rows (transaction boundaries described in [api-design.md](./api-design.md)).

### 3. SQLite storage

**User outcome:** All collection and catalog data persist in a single local SQLite database file; user-uploaded part and set images persist in the same database (Phase 10 BLOB columns).

**Acceptance criteria:**

- Database path is configurable (environment variable); sensible default for local dev documented in [development-plan.md](./development-plan.md).
- Schema is versioned with **Alembic** migrations.
- Application starts only if migrations can be applied or the database is at the expected revision.

### 4. Owned sets list

**User outcome:** A screen lists every **owned-set instance** with enough context to distinguish copies of the same `set_num` (set number, name, year, thumbnail, investigation status, missing count, optional label).

**Acceptance criteria:**

- List is **paginated** (offset/limit) per [api-design.md](./api-design.md).
- Rows link to the **set detail** view for that instance `id`.
- **Investigated** vs **not investigated** is visible (badge or column); optional filter by investigation state.
- Multiple rows may share the same `set_num` (distinct `id`).
- Sets without a successful catalog sync yet appear as owned with **placeholder or partial** display until sync completes.
- Each row shows **`{display_label} — {set_num}`** where `display_label` is the user label or default `Copy #n`.
- Under the set number line, show **name** (default “Unknown name”), **theme** (default “Unknown theme”), **part count** (default `?`), and **age** (default `?`).
- **Make a copy** action per row opens a **confirmation dialog** before creating a new instance (see [§8](#8-duplicate-owned-set-instance)); no duplicate action on the detail page.

### 5. Set detail page with parts

**User outcome:** Selecting an owned-set instance shows catalog metadata for its `set_num`, investigation controls, optional label, plus the full **parts inventory** (including colors, quantities, images where available). Minifigures appear consistently with how Rebrickable models them.

**Acceptance criteria:**

- Detail view includes theme, year, name, set number, and image when present.
- User can edit **all instance-level fields**: `label` (default `Copy #n` when empty in the UI), `investigated`, `age`, and `notes`.
- User can **delete** this owned-set instance (with confirmation); missing rows and local photos for that instance are removed.
- **Make a copy** is **not** on the detail page (list only, with confirmation dialog per [§8](#8-duplicate-owned-set-instance)).
- User can edit **shared catalog fields** on detail (`name`, theme, part count, age, etc.); changes apply to **every** owned-set instance with the same `catalog_set_id`, except **`set_num`** (see below).
- Changing **`set_num`**: show a warning (“You are about to change the LEGO set number”); **Cancel** restores the previous value; **Continue** re-links **only this instance** to the new set number (create or match `catalog_sets` row) without changing other instances.
- Inventory table supports sorting or stable default order (e.g. by part number, then color).
- Rebrickable **spare** and **alternate** inventory rows are **not imported** (not shown in the UI).
- Distinct **stickered vs plain** parts appear as distinct rows matching importer data.
- User can **add** a set-part via a modal (**+** control); modal supports optional **part image** upload (Phase 11A).
- User can **open the same modal** by clicking a set-part row to **update** line fields or **delete** the line (**Update** / **Delete** / **Cancel**; Phase 11A).
- Set-parts table shows **alias identifiers** per line, read-only (Phase 11A); user edits aliases in the same modal (Phase 11B).

### 6. Search by set number and part number

**User outcome:** The user can find owned-set instances or catalog parts by typing a set number or part number (or alias).

**Acceptance criteria:**

- Search returns **owned-set instances** when matching set numbers (including normalized forms agreed in [data-sources.md](./data-sources.md)); results may include multiple rows for one `set_num`.
- Search returns **parts** that appear in the user’s owned sets’ inventories when matching part number or a stored **alias**.
- Empty query returns a **validation error** (400), not a full dump.
- Response time remains acceptable on a typical personal library (thousands of parts); indexes defined in [database-schema.md](./database-schema.md).

### 7. Missing part tracking

**User outcome:** From an owned-set instance’s inventory, the user marks parts (per color) as missing, adjusts quantities, clears them when found, and attaches **at most one local image** per missing line for offline reference and future reports.

**Acceptance criteria:**

- Missing state is stored **per owned-set instance**, not globally.
- User cannot mark missing more than the **expected quantity** from inventory for that part/color (validation).
- UI and API expose current missing lines and remaining “complete” status at a glance for that instance.
- Clearing missing removes or zeroes the corresponding records without deleting catalog inventory.
- User can **upload**, **replace**, and **remove** the photo for a missing line; bytes are stored on the **part** record (global per `part_id`) and served via same-origin API URLs (no dependency on Rebrickable CDN for that photo).

### 8. Duplicate owned-set instance (“Make a copy”)

**User outcome:** When the user buys another copy of a set they already own, they use **Make a copy** on the owned sets list to create a **new instance** for the same `set_num` after confirming in a dialog.

**Acceptance criteria:**

- Button label is **Make a copy** (not “Add copy”).
- Action available from **owned sets list only** (not on set detail).
- Dialog states that a copy of set number **X** is being created; shows editable **label** prefilled with **`Copy #n`** (`n` = number of existing instances for that `set_num` + 1); **Cancel** and **Create a copy** buttons; POST runs only after confirm.
- Creates a new `owned_sets` row with the same `catalog_set_id` as the source instance.
- New instance has `investigated` = **false**, confirmed `label`, `age` = **null**, `notes` = **null**, and **no** `missing_items`.
- Response returns the new instance `id` for navigation.
- **`404`** if the source owned-set `id` does not exist.
- Does not modify or delete the source instance.

### 9. Delete owned-set instance

**User outcome:** The user can remove an owned-set instance they no longer own.

**Acceptance criteria:**

- **Delete** action on the **set detail** view (after opening the instance), with a confirmation dialog.
- **`DELETE /owned-sets/{id}`** removes the instance and its `missing_items`. Part/set BLOB images on shared catalog rows remain unless the last instance for that catalog set is deleted (catalog cleanup).
- If this was the last instance for that catalog set, **catalog and inventory rows are deleted** as well (full removal from the database).
- **`404`** if the id does not exist.

### 10. Shared vs per-instance catalog edits

| Field | Scope when edited from detail |
|-------|-------------------------------|
| `set_num` | **This instance only**, after warning + Continue; Cancel restores previous value. |
| `name`, theme, `num_parts`, `age`, etc. | **All instances** sharing the same `catalog_set_id`. |

**Provenance:** every field in the table above (and `set_num`) may be filled from **Rebrickable** (or left empty after CSV import) **or** entered/edited by the user on set detail—except **`label`**, which is user-only per instance. See [data-sources.md — Catalog metadata (dual source)](./data-sources.md#catalog-metadata-dual-source). Re-running Rebrickable sync refreshes catalog fields from the API and may overwrite prior manual values.

Rebrickable sync may populate age as `6+` → store **`6`** (integer). CSV import does **not** rename existing instance labels; duplicate custom labels are allowed.

## 11. Post-MVP collection semantics (Phases 9–13)

The following extends MVP after Phase 8. See [development-plan.md](./development-plan.md) for delivery order. **Phases 9–10 are implemented** on `main`; Phases **11A–11B**, **12**, and **13** are planned (Phase 13 wizard is partially implemented).

### 11.1 Collection invariant: all sets are owned

The database does not store LEGO sets the user does not own. Every `catalog_sets` row has at least one `owned_sets` row. Deleting the last instance for a set number removes catalog and inventory for that set (existing delete rule).

### 11.2 Rebrickable fetch without images

When importing or enriching from Rebrickable (CSV import in Phase 12, optional prefill in manual add, and existing sync endpoint):

- **Fetch:** set metadata, full set parts inventory, minifigs, and minifig BOMs.
- **Do not fetch:** image bytes from Rebrickable CDN URLs (no local cache folders, no automatic BLOB population from URLs in these flows).

User-uploaded images are stored in SQLite (Phase 10).

### 11.3 Shared vs per-instance fields

| Data | Scope when user edits |
|------|------------------------|
| Set name, theme, year, number of parts, age, **set image** | **All instances** sharing the same `catalog_set_id` / `set_num`. |
| Instance label, investigated, notes | **This instance only**. |
| `set_num` re-link | **This instance only** (with warning; existing MVP rule). |
| **Part quantity** on inventory | **This instance only** (Phase 9). |
| **Missing quantity** per line | **This instance only**; must satisfy `0 ≤ missing ≤ quantity` for that instance line. |
| **Part image** | **Global per `parts` row** — updating the image for part X updates every inventory line that references part X in every set. |
| **Part aliases** | **Symmetric equivalence class** — see §11.5. |

### 11.4 Part images

- Any inventory line **may** have a user-provided image via its part record; missing parts are the primary use case.
- One image per part (JPEG/PNG BLOB in DB, max 5 MB).
- **Add** and **edit** part modals (Phase 11A) include upload/replace/delete for the part image (same global `parts` row as inline editors).

### 11.5 Part aliases (bidirectional)

Users may edit the alias list for a part (Phase **11B** UI: chip list in **PartLineModal**). The system maintains an **undirected** alias group:

- If part **B** is added to part **X**’s alias list, **X** is added to **B**’s alias list.
- If part **A** is removed from **X**’s alias list, **X** is removed from **A**’s alias list.

Search treats all members of the group as interchangeable for part-number lookup.

### 11.6 CSV import (Phase 12)

Unchanged additive semantics (one token → one new instance). Additionally, for each token the app calls Rebrickable and upserts **full** catalog inventory (no images). Failures are per-token; valid tokens still succeed.

### 11.7 Manual add set (Phase 13)

1. User enters **set number** (only required field).
2. If set number **already exists:** show message that a **new instance** is being created; load catalog + inventory from DB; create instance; user edits instance fields on detail.
3. If set number **is new:** user enters set metadata and parts list (or optional Rebrickable prefill without images); system creates catalog + **first** instance + instance inventory.

### 11.8 Part alias editing in modal (Phase 11B)

- **AliasChipEditor** in add and edit **PartLineModal**: removable chips plus “Add alias” field; canonical **part number** shown separately (read-only on edit), not as a chip.
- API: `PATCH /parts/{part_id}/aliases` with replace-list body; server enforces symmetric closure (§11.5).
- Alias edits are **global** for the equivalence class (like part images): all sets using any member part reflect the updated alias group in search and detail.

### 11.9 Sync UX (deferred)

No new bulk sync UI in Phases 9–13. `POST /imports/rebrickable/sync` remains for later enhancement (Phase 14+).

## UX surfaces (MVP)

1. **Owned sets** — list layout per [§4](#4-owned-sets-list); **Make a copy** with confirmation dialog per row.
2. **Set detail** — instance field editor + inventory + missing panel; **delete** instance; no duplicate button.
3. **Search** — single entry point or dual mode (set vs part) per API design.
4. **Import** — CSV/text file upload (additive); trigger Rebrickable sync (MVP). *Post-MVP:* CSV also fetches full set data (Phase 12); **Add set** wizard (Phase 13); **PartLineModal** on set detail (Phases 11A–11B).

## Non-goals (MVP)

- Multi-user authentication, roles, or hosted SaaS deployment requirements.
- Cloud sync, backup, or merge across devices.
- BrickLink, BrickOwl, or other marketplaces; pricing or availability.
- Native mobile apps.
- **PDF/print report generation** (MVP stores images and exposes them in the UI/API so a report feature can be added later without new storage design).
- Advanced analytics, wish lists, or part-out planning.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`.
- [data-sources.md](./data-sources.md) — CSV and Rebrickable contracts.
- [database-schema.md](./database-schema.md) — tables and relationships.
- [api-design.md](./api-design.md) — REST endpoints and payloads.
- [development-plan.md](./development-plan.md) — delivery phases.
- [testing-strategy.md](./testing-strategy.md) — verification approach.
- [ci.md](./ci.md) — continuous integration (push/PR).
