from pydantic import BaseModel


class CsvTokenError(BaseModel):
    token_index: int
    raw: str
    message: str


class CsvImportResponse(BaseModel):
    instances_created: int
    catalog_stubs_created: int
    errors: list[CsvTokenError]
