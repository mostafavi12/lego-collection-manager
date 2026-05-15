from pydantic import BaseModel


class SearchSetResult(BaseModel):
    owned_set_id: int
    set_num: str
    name: str | None
    investigated: bool
    label: str | None


class SearchPartResult(BaseModel):
    part_num: str
    name: str | None
    image_url: str | None


class SearchResponse(BaseModel):
    sets: list[SearchSetResult] = []
    parts: list[SearchPartResult] = []
