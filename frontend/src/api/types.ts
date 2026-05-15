export interface OwnedSetListItem {
  id: number;
  set_num: string;
  name: string | null;
  year: number | null;
  theme_name: string | null;
  image_url: string | null;
  catalog_sync_state: string;
  investigated: boolean;
  label: string | null;
  display_label: string;
  copy_index: number;
  age: number | null;
  num_parts: number | null;
  missing_count: number;
}

export interface DuplicatePreviewResponse {
  source_owned_set_id: number;
  set_num: string;
  set_name: string | null;
  existing_copy_count: number;
  suggested_label: string;
}

export interface OwnedSetUpdateBody {
  investigated?: boolean;
  label?: string | null;
  notes?: string | null;
  age?: number | null;
  set_num?: string;
  catalog_name?: string | null;
  catalog_num_parts?: number | null;
  catalog_year?: number | null;
  catalog_theme_name?: string | null;
}

export interface OwnedSetListResponse {
  items: OwnedSetListItem[];
  total: number;
}

export interface OwnedSetDuplicateResponse extends OwnedSetListItem {
  duplicated_from_owned_set_id: number;
}

export interface CatalogBlock {
  catalog_set_id: number;
  set_num: string;
  name: string | null;
  year: number | null;
  theme_name: string | null;
  image_url: string | null;
  num_parts: number | null;
}

export interface AddSetPartLineBody {
  part_num: string;
  part_name?: string | null;
  color_id?: number;
  color_name?: string | null;
  quantity: number;
}

export interface InstanceInventoryLineUpdate {
  quantity?: number;
  quantity_missing?: number;
}

export interface UpdateSetPartLineBody {
  part_name?: string | null;
  color_id?: number;
  color_name?: string | null;
  quantity?: number;
}

export interface InstanceInventoryLineResponse {
  instance_line_id: number;
  part_id: number;
  catalog_line_id: number;
  quantity: number;
  quantity_missing: number;
}

export interface SetPartLineDetail {
  instance_line_id: number;
  catalog_line_id: number;
  part_id: number;
  part_num: string;
  part_name: string | null;
  color_id: number;
  color_name: string;
  quantity: number;
  aliases: string[];
  image_url: string | null;
  part_image_url: string | null;
  missing_quantity: number;
  missing_item_id: number | null;
  missing_image_url: string | null;
}

export interface MinifigPartLineDetail {
  instance_line_id: number;
  catalog_line_id: number;
  part_id: number;
  part_num: string;
  part_name: string | null;
  color_id: number;
  color_name: string;
  quantity: number;
  image_url: string | null;
  part_image_url: string | null;
  missing_quantity: number;
  missing_item_id: number | null;
  missing_image_url: string | null;
}

export interface MinifigInventoryBlock {
  line_id: number;
  minifig_num: string;
  name: string | null;
  quantity: number;
  parts: MinifigPartLineDetail[];
}

export interface InventoryBlock {
  set_parts: SetPartLineDetail[];
  minifigs: MinifigInventoryBlock[];
}

export interface OwnedSetDetailResponse {
  id: number;
  investigated: boolean;
  label: string | null;
  display_label: string;
  copy_index: number;
  age: number | null;
  notes: string | null;
  catalog: CatalogBlock;
  inventory: InventoryBlock;
}

export interface SearchSetResult {
  owned_set_id: number;
  set_num: string;
  name: string | null;
  investigated: boolean;
  label: string | null;
}

export interface SearchPartResult {
  part_num: string;
  name: string | null;
  image_url: string | null;
}

export interface SearchResponse {
  sets: SearchSetResult[];
  parts: SearchPartResult[];
}

export interface AddPreviewPartLine {
  part_num: string;
  part_name: string | null;
  color_name: string;
  quantity: number;
}

export interface OwnedSetAddPreviewResponse {
  set_num: string;
  catalog_exists: boolean;
  set_name: string | null;
  existing_copy_count: number;
  suggested_label: string;
  theme_name: string | null;
  year: number | null;
  num_parts: number | null;
  age: number | null;
  image_url: string | null;
  set_parts: AddPreviewPartLine[];
}

export interface ManualAddCatalogInput {
  name?: string | null;
  theme_name?: string | null;
  year?: number | null;
  num_parts?: number | null;
}

export interface ManualAddPartInput {
  part_num: string;
  part_name?: string | null;
  color_id?: number;
  color_name?: string | null;
  quantity: number;
}

export interface OwnedSetCreateBody {
  set_num: string;
  label?: string | null;
  age?: number | null;
  catalog?: ManualAddCatalogInput;
  parts?: ManualAddPartInput[];
}

export interface OwnedSetCreateResponse extends OwnedSetListItem {
  catalog_created: boolean;
}

export interface CsvImportSetFailure {
  token_index: number;
  set_num: string;
  message: string;
}

export interface CsvImportResponse {
  instances_created: number;
  catalog_stubs_created: number;
  sets_fetched: number;
  sets_failed: CsvImportSetFailure[];
  errors: { token_index: number; raw: string; message: string }[];
}

export interface RebrickableSyncResponse {
  sets_synced: number;
  sets_failed: { set_num: string; message: string }[];
  parts_upserted: number;
  inventory_lines_written: number;
}

export interface MissingUpsertResponse {
  owned_set_id: number;
  missing_item_id: number;
  updated_lines: number;
}

export interface ImageUploadResponse {
  image_url: string;
}

export interface ImageDeleteResponse {
  image_url: string | null;
}

export interface PartAliasesReplaceBody {
  aliases: string[];
}

export interface PartAliasesResponse {
  part_id: number;
  part_num: string;
  aliases: string[];
}

export interface MissingImageResponse {
  missing_item_id: number;
  missing_image_url: string | null;
  part_image_url: string | null;
}
