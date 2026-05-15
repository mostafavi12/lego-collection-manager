from pydantic import BaseModel, Field


class CsvTokenError(BaseModel):
    token_index: int
    raw: str
    message: str


class CsvImportResponse(BaseModel):
    instances_created: int
    catalog_stubs_created: int
    errors: list[CsvTokenError]


class RebrickableSyncRequest(BaseModel):
    owned_set_ids: list[int] | None = None


class RebrickableSetSyncFailure(BaseModel):
    set_num: str
    message: str


class RebrickableSyncResponse(BaseModel):
    sets_synced: int
    sets_failed: list[RebrickableSetSyncFailure] = Field(default_factory=list)
    parts_upserted: int
    inventory_lines_written: int
