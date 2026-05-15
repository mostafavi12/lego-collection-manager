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

### Rebrickable sync — synchronous (MVP)

**`POST /imports/rebrickable/sync`**

MVP uses a **synchronous** request that completes the full sync for the selected scope before returning **`200`**. This avoids background job infrastructure at the cost of longer request duration for large collections.

| Tradeoff | Mitigation |
|----------|------------|
| Long HTTP request | Sequential per-set processing; frontend shows spinner + cancel is browser-only (server continues unless implement stop flag post-MVP). |
| Timeouts | Document recommended max owned sets per operation; paginate sync by passing explicit `owned_set_ids`. |

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
      "missing_count": 2
    }
  ],
  "total": 42
}
```

`catalog_sync_state`: `ok` \| `pending` \| `error` (surface last sync issue for the underlying catalog set if stored).

Multiple `items` may share the same `set_num` with different `id`.

### Owned set detail

**`GET /owned-sets/{id}`**

**Response `200`:** nested structure for one screen load.

```json
{
  "id": 1,
  "investigated": false,
  "label": "eBay May 2026",
  "catalog": {
    "set_num": "6024-1",
    "name": "Police Car",
    "year": 1980,
    "theme_name": "Classic Town",
    "image_url": "https://cdn.rebrickable.com/…",
    "num_parts": 27
  },
  "inventory": {
    "set_parts": [
      {
        "line_id": 9001,
        "part_num": "3024",
        "part_name": "Plate 1 x 1",
        "color_id": 0,
        "color_name": "Black",
        "quantity": 4,
        "is_spare": false,
        "is_alternate": false,
        "image_url": "https://…",
        "missing_quantity": 1,
        "missing_item_id": 501,
        "missing_image_url": "/api/media/missing/501"
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
            "line_id": 9101,
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

`missing_quantity`, `missing_item_id`, and `missing_image_url` are derived from `missing_items` for this owned-set instance. `missing_image_url` is null when no user photo exists.

**Catalog images:** Rebrickable URLs are passed through from the database; the frontend does not proxy them in MVP.

### Update owned-set instance metadata

**`PATCH /owned-sets/{id}`**

```json
{
  "investigated": true,
  "label": "Checked — missing windshield"
}
```

Both fields optional; omitted fields unchanged.

**Response `200`:** same shape as list item fields for the updated instance.

### Duplicate owned-set instance

**`POST /owned-sets/{id}/duplicate`**

Creates a **new** owned-set instance for the same catalog set as the source row.

| Rule | Behavior |
|------|----------|
| `catalog_set_id` | Copied from source instance |
| `investigated` | Always **`false`** |
| `label`, `notes` | **`null`** (not copied from source) |
| `missing_items` | **None** on the new instance |
| Source instance | Unchanged |

**Response `201`:**

```json
{
  "id": 8,
  "set_num": "6024-1",
  "name": "Police Car",
  "year": 1980,
  "theme_name": "Classic Town",
  "image_url": "https://cdn.rebrickable.com/…",
  "catalog_sync_state": "ok",
  "investigated": false,
  "label": null,
  "missing_count": 0,
  "duplicated_from_owned_set_id": 1
}
```

`duplicated_from_owned_set_id` is informational (the `{id}` in the path); omit from persistence if not needed in the database.

**`404`** if source `id` is unknown.

## Media (local missing-part images)

**`GET /media/missing/{missing_item_id}`**

- Returns the stored image bytes with correct `Content-Type` (`image/jpeg` or `image/png`).
- **`404`** if no image or unknown id.
- Used by the UI and future report generation; works offline when the app and files are local.

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

- `quantity_missing` ≥ 0. If `0`, **delete** existing missing row for that owned set + line (and **delete** any stored image file).
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

- **Body:** `multipart/form-data`, field `file` (JPEG or PNG; max **5 MB** MVP default).
- **Behavior:** Store under `UPLOAD_ROOT`; set `missing_items.image_path`; replace deletes previous file.
- **`404`** if `missing_item_id` does not belong to `owned_set_id`.
- **`400`** if wrong content type or empty file.

**Response `200`:**

```json
{
  "missing_item_id": 501,
  "missing_image_url": "/api/media/missing/501"
}
```

### Remove missing-part image

**`DELETE /owned-sets/{owned_set_id}/missing/{missing_item_id}/image`**

- Clears `image_path` and deletes file from disk.
- Missing quantity row **remains** unless cleared via `PATCH .../missing` with `quantity_missing: 0`.

**Response `204`** or **`200`** with `{ "missing_item_id": 501, "missing_image_url": null }`.

### Optional read

Missing lines are embedded in **`GET /owned-sets/{id}`**; a dedicated `GET /owned-sets/{id}/missing` is **optional** if the detail payload becomes too heavy post-MVP.

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
