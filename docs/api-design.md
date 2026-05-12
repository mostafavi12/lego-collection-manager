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
| `400` | Validation (bad query, impossible missing quantity). |
| `404` | Unknown `id` or resource. |
| `409` | Conflict (e.g. duplicate semantics not applicable if DB prevents duplicates—rare). |
| `422` | Request body schema validation (Pydantic). |
| `503` | Upstream Rebrickable unreachable after retries (optional; may also map to `502`). |

## Import operations

### CSV import — synchronous

**`POST /imports/csv`**

- **Body:** `multipart/form-data` with field `file` (CSV per [data-sources.md](./data-sources.md)).
- **Max size:** 1 MB (MVP default; configurable server-side).
- **Behavior:** For each valid `set_num`, upsert a **stub** `catalog_sets` row when none exists (see [database-schema.md](./database-schema.md)), then upsert the corresponding `owned_sets` row linked by `catalog_set_id` (**no duplicate ownership** per set).

**Stub strategy:** CSV import always ensures a `catalog_sets` row exists (minimal fields, `source` = `csv_import`) so `owned_sets.catalog_set_id` remains NOT NULL; Rebrickable sync later fills catalog metadata and inventories. Sets not yet successfully synced appear in list/detail with `catalog_sync_state` = `pending` (per API contract).

- **Response `200`:**

```json
{
  "created_owned": 3,
  "updated_owned": 0,
  "skipped_duplicates": 1,
  "errors": [
    { "row": 4, "message": "empty set_num" }
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

Omit `owned_set_ids` or pass `null` to sync **all** owned sets.

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

**`GET /owned-sets?limit=50&offset=0`**

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
      "missing_count": 2
    }
  ],
  "total": 42
}
```

`catalog_sync_state`: `ok` \| `pending` \| `error` (surface last sync issue per owned set if stored).

### Owned set detail

**`GET /owned-sets/{id}`**

**Response `200`:** nested structure for one screen load.

```json
{
  "id": 1,
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
        "missing_quantity": 1
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
            "missing_quantity": 0
          }
        ]
      }
    ]
  }
}
```

`missing_quantity` on each line is **aggregated** from `missing_items` for that owned set and line (0 if none).

**Images:** URLs are passed through from the database (Rebrickable CDN); the frontend does not proxy images in MVP.

## Search

**`GET /search?q=3024&type=part&limit=20&offset=0`**

| Param | Values |
|-------|--------|
| `q` | Required, non-empty after trim. |
| `type` | `set` \| `part` \| `all` (default `all`). |

**Semantics:**

- **`type=set`:** Match `catalog_sets.set_num` (prefix or exact—document **prefix** for MVP) for sets that appear in `owned_sets`.
- **`type=part`:** Match `parts.part_num` or `part_aliases.alias`; return parts that occur in inventories of **owned** sets only (not global LEGO catalog search).
- **`type=all`:** Return two buckets or a unified list with `result_kind` discriminator (implementation choice; unified is simpler for one UI field).

**Example response (`type=all`):**

```json
{
  "sets": [
    { "owned_set_id": 1, "set_num": "6024-1", "name": "Police Car" }
  ],
  "parts": [
    {
      "part_num": "3024",
      "name": "Plate 1 x 1",
      "image_url": "https://…",
      "appears_in": [{ "owned_set_id": 1, "set_num": "6024-1" }]
    }
  ]
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

- `quantity_missing` ≥ 0. If `0`, **delete** existing missing row for that owned set + line (idempotent clear).
- If > 0, must be ≤ `quantity` on the referenced inventory line (**400** if not).

**Response `200`:**

```json
{
  "owned_set_id": 1,
  "updated_lines": 1
}
```

### Optional read

Missing lines are embedded in **`GET /owned-sets/{id}`**; a dedicated `GET /owned-sets/{id}/missing` is **optional** if the detail payload becomes too heavy post-MVP.

## CORS

Backend allows the Vite dev origin (e.g. `http://localhost:5173`) via environment-driven CORS settings for MVP.

## OpenAPI

FastAPI auto-generates **OpenAPI** at `/openapi.json`; this document remains the **human rationale**; drift should be avoided by treating these specs as acceptance references during implementation.

## Related documents

- [product-requirements.md](./product-requirements.md)
- [database-schema.md](./database-schema.md)
- [data-sources.md](./data-sources.md)
