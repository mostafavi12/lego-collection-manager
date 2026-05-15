import type {
  AddSetPartLineBody,
  AddSetPreviewResponse,
  CsvImportResponse,
  DuplicatePreviewResponse,
  ImageDeleteResponse,
  ImageUploadResponse,
  InstanceInventoryLineResponse,
  InstanceInventoryLineUpdate,
  MissingImageResponse,
  MissingUpsertResponse,
  PartAliasesReplaceBody,
  PartAliasesResponse,
  RebrickableSetDraftResponse,
  RebrickableSyncResponse,
  SearchResponse,
  SetCopyCreateBody,
  SetCopyCreateResponse,
  SetCopyDetailResponse,
  SetCopyDuplicateResponse,
  SetCopyListItem,
  SetCopyListResponse,
  SetCopyUpdateBody,
  UpdateSetPartLineBody,
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
): Promise<AddSetPreviewResponse> {
  const params = new URLSearchParams({ set_num: setNum.trim() });
  return request(`/owned-sets/add-preview?${params}`);
}

export function fetchManualAddRebrickableDraft(
  setNum: string,
): Promise<RebrickableSetDraftResponse> {
  const params = new URLSearchParams({ set_num: setNum.trim() });
  return request(`/owned-sets/add-rebrickable-draft?${params}`);
}

export function createSetCopy(
  body: SetCopyCreateBody,
): Promise<SetCopyCreateResponse> {
  return request("/owned-sets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listSetCopies(params: {
  limit?: number;
  offset?: number;
  investigated?: boolean;
}): Promise<SetCopyListResponse> {
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

export function getSetCopy(id: number): Promise<SetCopyDetailResponse> {
  return request(`/owned-sets/${id}`);
}

export function updateSetCopy(
  id: number,
  body: SetCopyUpdateBody,
): Promise<SetCopyListItem> {
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

export function duplicateSetCopy(
  id: number,
  label: string,
): Promise<SetCopyDuplicateResponse> {
  return request(`/owned-sets/${id}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

export function deleteSetCopy(
  id: number,
): Promise<{ deleted: boolean; id: number }> {
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
  setCopyIds?: number[],
): Promise<RebrickableSyncResponse> {
  return request("/imports/rebrickable/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      setCopyIds?.length ? { owned_set_ids: setCopyIds } : {},
    ),
  });
}

export function addSetPartLine(
  setCopyId: number,
  body: AddSetPartLineBody,
): Promise<InstanceInventoryLineResponse> {
  return request(`/owned-sets/${setCopyId}/set-parts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function updateSetPartLine(
  setCopyId: number,
  instanceLineId: number,
  body: UpdateSetPartLineBody,
): Promise<InstanceInventoryLineResponse> {
  return request(`/owned-sets/${setCopyId}/set-parts/${instanceLineId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deleteSetPartLine(
  setCopyId: number,
  instanceLineId: number,
): Promise<void> {
  return request(`/owned-sets/${setCopyId}/set-parts/${instanceLineId}`, {
    method: "DELETE",
  });
}

export function patchInstanceInventoryLine(
  setCopyId: number,
  instanceLineId: number,
  body: InstanceInventoryLineUpdate,
): Promise<InstanceInventoryLineResponse> {
  return request(
    `/owned-sets/${setCopyId}/inventory-lines/${instanceLineId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function patchMissing(
  setCopyId: number,
  body:
    | { set_part_inventory_line_id: number; quantity_missing: number }
    | { minifig_part_inventory_line_id: number; quantity_missing: number },
): Promise<MissingUpsertResponse> {
  return request(`/owned-sets/${setCopyId}/missing`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function uploadMissingImage(
  setCopyId: number,
  missingItemId: number,
  file: File,
): Promise<MissingImageResponse> {
  const form = new FormData();
  form.append("file", file);
  return request(`/owned-sets/${setCopyId}/missing/${missingItemId}/image`, {
    method: "PUT",
    body: form,
  });
}

export function deleteMissingImage(
  setCopyId: number,
  missingItemId: number,
): Promise<MissingImageResponse> {
  return request(`/owned-sets/${setCopyId}/missing/${missingItemId}/image`, {
    method: "DELETE",
  });
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

export function patchPartAliases(
  partId: number,
  body: PartAliasesReplaceBody,
): Promise<PartAliasesResponse> {
  return request(`/parts/${partId}/aliases`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
