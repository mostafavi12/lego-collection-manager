import type {
  CsvImportResponse,
  DuplicatePreviewResponse,
  OwnedSetAddPreviewResponse,
  OwnedSetCreateBody,
  OwnedSetCreateResponse,
  ImageDeleteResponse,
  ImageUploadResponse,
  InstanceInventoryLineResponse,
  InstanceInventoryLineUpdate,
  MissingImageResponse,
  MissingUpsertResponse,
  OwnedSetDetailResponse,
  OwnedSetDuplicateResponse,
  OwnedSetListItem,
  OwnedSetListResponse,
  OwnedSetUpdateBody,
  RebrickableSyncResponse,
  SearchResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const { detail } = body;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "object" && item !== null && "msg" in item) {
            return String((item as { msg: string }).msg);
          }
          return String(item);
        })
        .join("; ");
    }
  } catch {
    /* ignore */
  }
  return response.statusText || `HTTP ${response.status}`;
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function mediaUrl(path: string | null): string | null {
  if (!path) {
    return null;
  }
  return path;
}

export function fetchAddSetPreview(
  setNum: string,
): Promise<OwnedSetAddPreviewResponse> {
  const params = new URLSearchParams({ set_num: setNum.trim() });
  return request(`/owned-sets/add-preview?${params}`);
}

export function createOwnedSet(
  body: OwnedSetCreateBody,
): Promise<OwnedSetCreateResponse> {
  return request("/owned-sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listOwnedSets(params: {
  limit?: number;
  offset?: number;
  investigated?: boolean;
}): Promise<OwnedSetListResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  if (params.offset != null) {
    search.set("offset", String(params.offset));
  }
  if (params.investigated != null) {
    search.set("investigated", String(params.investigated));
  }
  const qs = search.toString();
  return request(`/owned-sets${qs ? `?${qs}` : ""}`);
}

export function getOwnedSet(id: number): Promise<OwnedSetDetailResponse> {
  return request(`/owned-sets/${id}`);
}

export function updateOwnedSet(
  id: number,
  body: OwnedSetUpdateBody,
): Promise<OwnedSetListItem> {
  return request(`/owned-sets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchDuplicatePreview(
  id: number,
): Promise<DuplicatePreviewResponse> {
  return request(`/owned-sets/${id}/duplicate-preview`);
}

export function duplicateOwnedSet(
  id: number,
  label: string,
): Promise<OwnedSetDuplicateResponse> {
  return request(`/owned-sets/${id}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

export function deleteOwnedSet(id: number): Promise<{ deleted: boolean; id: number }> {
  return request(`/owned-sets/${id}`, { method: "DELETE" });
}

export function searchCatalog(params: {
  q: string;
  type?: "set" | "part" | "all";
  limit?: number;
}): Promise<SearchResponse> {
  const search = new URLSearchParams({ q: params.q });
  if (params.type) {
    search.set("type", params.type);
  }
  if (params.limit != null) {
    search.set("limit", String(params.limit));
  }
  return request(`/search?${search}`);
}

export function importCsv(file: File): Promise<CsvImportResponse> {
  const form = new FormData();
  form.append("file", file);
  return request("/imports/csv", { method: "POST", body: form });
}

export function syncRebrickable(
  ownedSetIds?: number[],
): Promise<RebrickableSyncResponse> {
  return request("/imports/rebrickable/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      ownedSetIds?.length ? { owned_set_ids: ownedSetIds } : {},
    ),
  });
}

export function patchInstanceInventoryLine(
  ownedSetId: number,
  instanceLineId: number,
  body: InstanceInventoryLineUpdate,
): Promise<InstanceInventoryLineResponse> {
  return request(
    `/owned-sets/${ownedSetId}/inventory-lines/${instanceLineId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function patchMissing(
  ownedSetId: number,
  body:
    | { set_part_inventory_line_id: number; quantity_missing: number }
    | { minifig_part_inventory_line_id: number; quantity_missing: number },
): Promise<MissingUpsertResponse> {
  return request(`/owned-sets/${ownedSetId}/missing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function uploadMissingImage(
  ownedSetId: number,
  missingItemId: number,
  file: File,
): Promise<MissingImageResponse> {
  const form = new FormData();
  form.append("file", file);
  return request(
    `/owned-sets/${ownedSetId}/missing/${missingItemId}/image`,
    { method: "PUT", body: form },
  );
}

export function deleteMissingImage(
  ownedSetId: number,
  missingItemId: number,
): Promise<MissingImageResponse> {
  return request(
    `/owned-sets/${ownedSetId}/missing/${missingItemId}/image`,
    { method: "DELETE" },
  );
}

function uploadImageBlob(
  path: string,
  file: File,
): Promise<ImageUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return request(path, { method: "PUT", body: form });
}

export function uploadCatalogSetImage(
  catalogSetId: number,
  file: File,
): Promise<ImageUploadResponse> {
  return uploadImageBlob(`/catalog-sets/${catalogSetId}/image`, file);
}

export function deleteCatalogSetImage(
  catalogSetId: number,
): Promise<ImageDeleteResponse> {
  return request(`/catalog-sets/${catalogSetId}/image`, { method: "DELETE" });
}

export function uploadPartImage(
  partId: number,
  file: File,
): Promise<ImageUploadResponse> {
  return uploadImageBlob(`/parts/${partId}/image`, file);
}

export function deletePartImage(partId: number): Promise<ImageDeleteResponse> {
  return request(`/parts/${partId}/image`, { method: "DELETE" });
}
