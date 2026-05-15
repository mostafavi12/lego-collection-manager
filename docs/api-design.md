# API design — LEGO Collection Manager (MVP)

REST **JSON** API served by **FastAPI** for the **React + Vite** frontend. All paths below are relative to a configurable API root (e.g. `/api`); examples omit prefix for clarity.

## Conventions

| Topic | Choice |
|-------|--------|
| **Format** | `Content-Type: application/json` for bodies; UTF-8. |
| **Naming** | Plural nouns for collections (`owned-sets`). |
| **IDs** | Integer primary keys exposed as `id` unless noted. |
| **Timestamps** | ISO 8601 UTC strings in JSON. |
| **Pagination** | `limit` (default 50, max 200) + `offset` (default 0) on list endpoints. |
| **Errors** | FastAPI default shape: `{"detail": ...}` where `detail` is a string or list of validation objects. |

### HTTP status usage

| Code | When |
|------|------|
| `200` | Success with body. |
| `400` | Validation (bad query, impossible missing quantity, invalid image type). |
| `404` | Unknown `id` or resource. |
| `409` | Conflict (rare). |
| `413` | Upload too large. |
| `422` | Request body schema validation (Pydantic). |
| `503` | Upstream Rebrickable unreachable after retries (optional; may also map to `502`). |

## Import operations

### CSV import — synchronous (additive)

**`POST /imports/csv`**

- **Body:** `multipart/form-data` with field `file` (plain text per [data-sources.md](./data-sources.md): comma-separated set numbers, no header).
- **Max size:** 1 MB (MVP default; configurable server-side).
- **Behavior:** For each valid set-number **token**, ensure a `catalog_sets` stub exists, then insert a **new** `owned_sets` row (`investigated` = `false`). **Every token creates a new instance**, including duplicate `set_num` values in the file or already present in the collection.

**Response `200`:**

```json
{
  "instances_created": 3,
  "catalog_stubs_created": 1,
  "errors": [
    { "token_index": 4, "raw": "", "message": "empty set number" }
  ]
}
```

### Rebrickable sync — synchronous

**`POST /imports/rebrickable/sync`**

The app uses a **synchronous** request that completes the sync for the selected scope before returning **`200`**. This avoids background job infrastructure at the cost of longer request duration for large collections.

| Phase | What is shipped |
|-------|-----------------|
| **14a (baseline)** | **Import** page: **Sync all owned sets** calls this endpoint with **no body** (full collection). Optional JSON body `{ "owned_set_ids": […] }` scopes sync to those instances **(API only today; no UI picker)**. |
| **14b (backlog)** | Subset sync UX from list/detail, progress/cancel, conflict policy with manual edits, optional CDN → BLOB image backfill. |

| Tradeoff | Mitigation |
|----------|------------|
| Long HTTP request | Sequential per-set processing; Import page shows a spinner while the request runs (browser “cancel” only stops the tab request; server may continue until process policies change in **14b**). |
| Timeouts | Document recommended max owned sets per operation; programmatic clients may pass explicit `owned_set_ids`. |

**`POST /imports/rebrickable/sync` body:**

```json
{
  "owned_set_ids": [1, 2, 3]
}
```

Omit `owned_set_ids` or pass `null` to sync **all** owned sets (distinct `catalog_set_id` values may be synced once per `set_num` while updating shared catalog inventory).

**Response `200`:**

```json
{
  "sets_synced": 3,
  "sets_failed": [
    { "set_num": "0000-1", "message": "HTTP 404 from Rebrickable" }
  ],
  "parts_upserted": 1200,
  "inventory_lines_written": 3500
}
```

**Transactional rule:** Each set’s catalog fetch + inventory write runs in a **transaction**; failure for one set rolls back only that set’s writes (others committed)—exact granularity is implementation-defined but must avoid half-written inventory for a single `set_num`.

**Environment:** Requires `REBRICKABLE_API_KEY`; if missing, return **`400`** with clear `detail`.

## Owned sets

### List owned sets

**`GET /owned-sets?limit=50&offset=0&investigated=false`**

| Query param | Purpose |
|-------------|---------|
| `investigated` | Optional filter: `true` \| `false`. Omit for all. |

**Response `200`:**

```json
{
  "items": [
    {
      "id": 1,
      "set_num": "6024-1",
      "name": "Police Car",
      "year": 1980,
      "theme_name": "Classic Town",
      "image_url": "https://cdn.rebrickable.com/…",
      "catalog_sync_state": "ok",
      "investigated": false,
      "label": "eBay May 2026",
      "display_label": "eBay May 2026",
      "copy_index": 1,
      "age": 6,
      "num_parts": 27,
      "missing_count": 2
    }
  ],
  "total": 42
}
```

| Field | Notes |
|-------|--------|
| `display_label` | `label` if set, else `Copy #{copy_index}`. |
| `copy_index` | 1-based index among instances sharing `catalog_set_id` (order: `created_at`, `id`). |
| `name` | Catalog name; UI default **Unknown name** when null. |
| `theme_name` | UI default **Unknown theme** when null. |
| `num_parts` | From catalog; UI default **`?`** when null. |
| `age` | Integer; shared across instances of same catalog set when PATCHed; UI default **`?`** when null. Rebrickable `6+` → `6` on sync. |

`catalog_sync_state`: `ok` \| `pending` \| `error` (surface last sync issue for the underlying catalog set if stored).

Multiple `items` may share the same `set_num` with different `id`.

**List title (UI):** render `{display_label} — {set_num}`; secondary line: name, theme, parts, age with defaults above.

### Owned set detail

**`GET /owned-sets/{id}`**

**Response `200`:** nested structure for one screen load.

```json
{
  "id": 1,
  "investigated": false,
  "label": "eBay May 2026",
  "display_label": "eBay May 2026",
  "copy_index": 1,
  "age": null,
  "notes": null,
  "catalog": {
    "catalog_set_id": 10,
    "set_num": "6024-1",
    "name": "Police Car",
    "year": 1980,
    "theme_name": "Classic Town",
    "image_url": "/api/catalog-sets/10/image",
    "num_parts": 27
  },
  "inventory": {
    "set_parts": [
      {
        "instance_line_id": 100,
        "catalog_line_id": 9001,
        "part_id": 42,
        "part_num": "3024",
        "part_name": "Plate 1 x 1",
        "color_id": 0,
        "color_name": "Black",
        "quantity": 4,
        "aliases": ["3024b", "3024pr"],
        "image_url": "https://…",
        "part_image_url": "/api/parts/42/image",
        "missing_quantity": 1,
        "missing_item_id": 501,
        "missing_image_url": "/api/parts/42/image"
      }
    ],
    "minifigs": [
      {
        "line_id": 40,
        "minifig_num": "fig-000001",
        "name": "Police Officer",
        "quantity": 1,
        "parts": [
          {
            "instance_line_id": 200,
            "catalog_line_id": 9101,
            "part_id": 7,
            "part_num": "3626b",
            "part_name": "Minifig Head",
            "color_id": 14,
            "color_name": "Yellow",
            "quantity": 1,
            "missing_quantity": 0,
            "missing_item_id": null,
            "missing_image_url": null
          }
        ]
      }
    ]
  }
}
```

`quantity` and `missing_quantity` are **per instance** (`owned_set_inventory_lines`). `missing_quantity`, `missing_item_id`, and `missing_image_url` reflect this instance’s missing state. When a part has a user BLOB, `part_image_url` is `/api/parts/{part_id}/image`; `missing_image_url` is the same URL when `missing_quantity` > 0 and a part image exists, otherwise null.

`aliases` (Phase **11A**): other identifiers for this `part_id` from `part_aliases`, excluding strings equal to `part_num`. Omitted or empty when none. Read-only in detail until Phase **11B** enables editing via `PATCH /parts/{part_id}/aliases`.

**Catalog `image_url`:** Rebrickable CDN URL when synced, or `/api/catalog-sets/{catalog_set_id}/image` when the user uploaded a set BLOB.

### Update owned-set instance metadata

**`PATCH /owned-sets/{id}`**

All fields optional; omitted fields unchanged.

| Field | Type | Scope | Notes |
|-------|------|-------|--------|
| `investigated` | boolean | This instance | |
| `label` | string \| null | This instance | Empty string clears (stored NULL); UI default display `Copy #{copy_index}`. |
| `notes` | string \| null | This instance | |
| `age` | integer \| null | **All instances** with same `catalog_set_id` | Rebrickable sync may set from `age_range` (`6+` → `6`). |
| `set_num` | string | **This instance only** | Re-links to matching or new `catalog_sets` row; clears this instance’s missing items. UI warning required. |
| `catalog_name` | string \| null | **All instances** (catalog row) | |
| `catalog_theme_name` | string \| null | **All instances** (catalog row) | Creates or links a `themes` row when `theme_id` was NULL. |
| `catalog_num_parts` | integer \| null | **All instances** (catalog row) | |
| `catalog_year` | integer \| null | **All instances** (catalog row) | |

Example (instance + shared catalog fields):

```json
{
  "investigated": true,
  "label": "Copy #2",
  "age": 8,
  "notes": "Second-hand, box damaged",
  "catalog_name": "Police Car",
  "catalog_theme_name": "Town",
  "catalog_num_parts": 27,
  "catalog_year": 1980
}
```

**Set number change:** send `set_num` only after UI warning; server re-links this instance to the matching or new `catalog_sets` row; other instances unchanged. Invalid or empty `set_num` → **400**.

**Response `200`:** same shape as list item fields for the updated instance.

### Delete owned-set instance

**`DELETE /owned-sets/{id}`**

- Deletes the `owned_sets` row; cascades `missing_items` and `owned_set_inventory_lines`.
- If no other `owned_sets` reference the same `catalog_set_id`, delete that **catalog set and its inventory** as well.
- **`404`** if unknown id.
- **`200`** with `{ "deleted": true, "id": 1 }` on success.

### Duplicate owned-set instance (“Make a copy”)

#### Preview (for confirmation dialog)

**`GET /owned-sets/{id}/duplicate-preview`**

**Response `200`:**

```json
{
  "source_owned_set_id": 1,
  "set_num": "6024-1",
  "set_name": "Police Car",
  "existing_copy_count": 2,
  "suggested_label": "Copy #3"
}
```

`suggested_label` = `Copy #{existing_copy_count + 1}`.

#### Create copy

**`POST /owned-sets/{id}/duplicate`**

**Body (optional):**

```json
{
  "label": "Copy #3"
}
```

If `label` is omitted, server uses `suggested_label` from the preview rules.

| Rule | Behavior |
|------|----------|
| `catalog_set_id` | Copied from source instance |
| `investigated` | Always **`false`** |
| `label` | From request body or `Copy #n` default |
| `age`, `notes` | **`null`** (not copied from source) |
| `missing_items` | **None** on the new instance |
| Source instance | Unchanged |

**Response `201`:** list-item shape plus `duplicated_from_owned_set_id`.

**`404`** if source `id` is unknown.

**UI:** list row **Make a copy** opens dialog using preview; **Create a copy** submits POST; **Cancel** discards.

## Images (SQLite BLOBs — Phase 10)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/parts/{part_id}/image` | Serve part image bytes |
| `PUT` | `/parts/{part_id}/image` | Upload/replace (multipart `file`; max 5 MB; JPEG/PNG) |
| `DELETE` | `/parts/{part_id}/image` | Clear part image |
| `GET` | `/catalog-sets/{catalog_set_id}/image` | Serve set box image |
| `PUT` | `/catalog-sets/{catalog_set_id}/image` | Upload/replace set image |
| `DELETE` | `/catalog-sets/{catalog_set_id}/image` | Clear set image |

**`PUT` response `200`:** `{ "image_url": "/api/parts/{part_id}/image" }` (or catalog-set path).

**`DELETE` response `200`:** `{ "image_url": null }`.

**`GET`** returns raw bytes with stored `Content-Type`. **`404`** when no BLOB. **`413`** when upload exceeds size limit.

Detail JSON exposes `catalog.catalog_set_id`, line `part_id`, `part_image_url`, and `catalog.image_url` as same-origin paths when BLOBs exist.

### Media (missing-line convenience)

**`GET /media/missing/{missing_item_id}`**

- Serves the **part** BLOB for the inventory line linked to this missing row when `quantity_missing` > 0.
- **`404`** if unknown id, no missing quantity, or no part image.
- Prefer `GET /parts/{part_id}/image` for direct part access; this route keeps older clients and `missing_image_url` working.

## Search

**`GET /search?q=3024&type=part&limit=20&offset=0`**

| Param | Values |
|-------|--------|
| `q` | Required, non-empty after trim. |
| `type` | `set` \| `part` \| `all` (default `all`). |

**Semantics:**

- **`type=set`:** Match `catalog_sets.set_num` (prefix for MVP) for sets that have at least one `owned_sets` row; return **owned-set instance** ids (multiple per `set_num` allowed).
- **`type=part`:** Match `parts.part_num` or `part_aliases.alias`; return parts that occur in inventories of **owned** catalog sets only.
- **`type=all`:** Return two buckets or a unified list with `result_kind` discriminator.

**Example response (`type=set`):**

```json
{
  "sets": [
    {
      "owned_set_id": 1,
      "set_num": "6024-1",
      "name": "Police Car",
      "investigated": false,
      "label": "copy A"
    },
    {
      "owned_set_id": 7,
      "set_num": "6024-1",
      "name": "Police Car",
      "investigated": true,
      "label": "complete"
    }
  ],
  "parts": []
}
```

Empty `q` → **`400`**.

## Missing parts

### Upsert missing for a line

**`PATCH /owned-sets/{owned_set_id}/missing`**

Body (exactly one line reference):

```json
{
  "set_part_inventory_line_id": 9001,
  "quantity_missing": 2
}
```

or

```json
{
  "minifig_part_inventory_line_id": 9101,
  "quantity_missing": 1
}
```

**Rules:**

- `quantity_missing` ≥ 0. If `0`, **delete** existing missing row for that owned set + line (part BLOB is **not** cleared automatically).
- If > 0, must be ≤ `quantity` on the referenced inventory line (**400** if not).
- Creates `missing_items` row when needed; does not accept image bytes in this endpoint.

**Response `200`:**

```json
{
  "owned_set_id": 1,
  "missing_item_id": 501,
  "updated_lines": 1
}
```

### Upload or replace missing-part image

**`PUT /owned-sets/{owned_set_id}/missing/{missing_item_id}/image`**

- **Body:** `multipart/form-data`, field `file` (JPEG or PNG; max **5 MB**).
- **Behavior:** Writes bytes to the linked line’s **`parts`** row (`image_blob`, `image_content_type`, `image_byte_size`). Global for that part across all sets.
- **`404`** if `missing_item_id` does not belong to `owned_set_id`.
- **`400`** if wrong content type or empty file.

**Response `200`:**

```json
{
  "missing_item_id": 501,
  "missing_image_url": "/api/parts/42/image",
  "part_image_url": "/api/parts/42/image"
}
```

### Remove missing-part image

**`DELETE /owned-sets/{owned_set_id}/missing/{missing_item_id}/image`**

- Clears the **part** BLOB (affects every set using that part).
- Missing quantity row **remains** unless cleared via `PATCH .../missing` with `quantity_missing: 0`.

**Response `200`:**

```json
{
  "missing_item_id": 501,
  "missing_image_url": null,
  "part_image_url": null
}
```

### Optional read

Missing lines are embedded in **`GET /owned-sets/{id}`**; a dedicated `GET /owned-sets/{id}/missing` is **optional** if the detail payload becomes too heavy post-MVP.

---

## Post-MVP endpoints (Phases 9–10 — implemented)

### Instance inventory (Phase 9)

Detail payload (`GET /owned-sets/{id}`) exposes per-line **`quantity`** and **`missing_quantity`** for **this instance** (from `owned_set_inventory_lines`).

**`PATCH /owned-sets/{owned_set_id}/inventory-lines/{instance_line_id}`**

```json
{
  "quantity": 4,
  "quantity_missing": 2
}
```

- `quantity` > 0 when provided; `0 ≤ quantity_missing ≤ quantity` when provided.
- **`404`** if `instance_line_id` does not belong to this owned set.
- Does not change other instances’ lines.

**`PATCH .../missing`** remains for missing-only updates using catalog line ids (`set_part_inventory_line_id` / `minifig_part_inventory_line_id`).

### Images in database (Phase 10)

See [Images (SQLite BLOBs — Phase 10)](#images-sqlite-blobs--phase-10) above.

---

## Post-MVP endpoints — reference (Phases 11A–13 implemented on `main`)

Contracts below match **shipped** behavior unless a bullet explicitly marks a gap (e.g. wizard UI vs API).

### Inventory part modal (Phase 11A)

**`POST /owned-sets/{owned_set_id}/set-parts`** — *implemented*; response extended:

```json
{
  "instance_line_id": 100,
  "part_id": 42,
  "catalog_line_id": 9001,
  "quantity": 2,
  "quantity_missing": 0
}
```

- Body unchanged: `part_num`, optional `part_name`, `color_id`, `color_name`, `quantity`.
- Client may call `PUT /parts/{part_id}/image` after **201** when the user selected a file.
- **`409`** if the part/color line already exists on this instance.

**`PATCH /owned-sets/{owned_set_id}/set-parts/{instance_line_id}`**

```json
{
  "part_name": "Plate 1 x 1",
  "color_id": 0,
  "color_name": "Black",
  "quantity": 4
}
```

- Updates shared catalog part name, catalog line color (may recreate line if color key changes — see implementation), and **instance** `quantity`.
- **`part_num` not accepted** (read-only in UI).
- **`404`** if the instance line does not belong to this owned set.

**`DELETE /owned-sets/{owned_set_id}/set-parts/{instance_line_id}`** → **`204`**

- Removes `owned_set_inventory_lines` for this instance.
- Deletes `set_part_inventory_lines` when no instance references that catalog line.
- Catalog-set cleanup when last instance deleted follows existing `DELETE /owned-sets/{id}` rules.

**`PATCH .../inventory-lines/{instance_line_id}`** (Phase 9, implemented) remains for inline **missing quantity** (and optional quantity) on the detail table; the part modal uses set-parts PATCH for full line edits.

### Part aliases (Phase 11B)

**`PATCH /api/parts/{part_id}/aliases`**

Request:

```json
{ "aliases": ["3024b", "3024pr"] }
```

Response **`200`:**

```json
{
  "part_id": 42,
  "part_num": "3024",
  "aliases": ["3024b", "3024pr"]
}
```

- **Replace-list** semantics: body is the full set of *other* identifiers for this part (exclude own `part_num` from chips in UI).
- Server enforces **symmetric closure** across the equivalence class (see [product-requirements.md §11.5](./product-requirements.md#115-part-aliases-bidirectional)).
- Manual rows use `source='user'`. If an alias string matches another existing `parts.part_num`, **merge** equivalence classes (simpler UX; no `409` unless validation fails).
- **`404`** unknown `part_id`; **`422`** invalid alias (empty, over max count e.g. 20).

### CSV import with Rebrickable (Phase 12)

**`POST /imports/csv`** response extended (example):

```json
{
  "instances_created": 3,
  "sets_fetched": 3,
  "sets_failed": [
    { "token_index": 2, "set_num": "0000-1", "message": "HTTP 404 from Rebrickable" }
  ],
  "errors": []
}
```

- Requires `REBRICKABLE_API_KEY`; **`400`** if missing.
- Per token: upsert catalog + template inventory + create instance + copy instance inventory (Phase 9).
- **No** image HTTP downloads during import.

### Manual add set (Phase 13)

**`GET /owned-sets/add-preview?set_num=…`** — **`200`**

Returns branching data for the **Add set** wizard (`AddSetWizard`) and for API clients.

| Field | Meaning |
|-------|--------|
| `set_num` | Normalized trimmed set number. |
| `catalog_exists` | `true` if a `catalog_sets` row already exists for this number. |
| `set_name`, `theme_name`, `year`, `num_parts`, `age`, `image_url` | Populated when **`catalog_exists`** (shared catalog + first non-null `owned_sets.age` among instances for age). |
| `existing_copy_count` | Number of `owned_sets` for that catalog set. |
| `suggested_label` | e.g. `Copy #n` for the next instance. |
| `set_parts` | Template set-part lines (`part_num`, `part_name`, `color_name`, `quantity`) when catalog exists; empty when `catalog_exists` is false. |

**`POST /owned-sets`** — create catalog + first instance **or** add another instance only.

| Case | Body | Server |
|------|------|--------|
| **Catalog exists** | **`set_num`** and optional **`label`** only. Sending `catalog` or `parts` → **400** (“omit catalog and parts”). | New `owned_sets` row; **`clone_instance_inventory`** from template. |
| **New catalog** | **`set_num`**; optional **`label`**, **`age`**, **`catalog`** (`name`, `theme_name`, `year`, `num_parts`), **`parts`** (array of `part_num`, optional `part_name`/`color_id`/`color_name`, `quantity` > 0). | Creates **`source=user`** catalog, optional lines from `parts`, first instance. |

The **wizard UI** uses **`add-preview`** then **`POST`**; for **net-new** catalogs it sends optional **`catalog`** + **`age`** + **`label`** but **does not** collect **`parts[]`**—users add inventory via **PartLineModal** on detail, **CSV** (Phase **12**), **sync** (**14a**), or a direct **`POST /owned-sets`** JSON body with `parts`.

**Example — new copy only**

```json
{ "set_num": "6024-1", "label": "Copy #2" }
```

**Example — first instance of a new set_num (API client)**

```json
{
  "set_num": "99999-1",
  "catalog": { "name": "…", "theme_name": "…", "year": 2020, "num_parts": 100 },
  "parts": [{ "part_num": "3024", "color_id": 0, "quantity": 2 }]
}
```

Part alias editing: [Part aliases (Phase 11B)](#part-aliases-phase-11b) (not part of the wizard contract).

See also [Rebrickable sync — synchronous](#rebrickable-sync--synchronous) for **Phase 14a / 14b** (Import **Sync all**, optional `owned_set_ids`).

## CORS

Backend allows the Vite dev origin (e.g. `http://localhost:5173`) via environment-driven CORS settings for MVP.

## OpenAPI

FastAPI auto-generates **OpenAPI** at `/openapi.json`; this document remains the **human rationale**; drift should be avoided by treating these specs as acceptance references during implementation.

## Related documents

- [README.md](./README.md) — index of all specification files in `docs/`
- [ci.md](./ci.md)
- [product-requirements.md](./product-requirements.md)
- [database-schema.md](./database-schema.md)
- [data-sources.md](./data-sources.md)
