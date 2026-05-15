from pydantic import BaseModel, Field


class InstanceInventoryLineUpdate(BaseModel):
    quantity: int | None = Field(default=None, gt=0)
    quantity_missing: int | None = Field(default=None, ge=0)


class InstanceInventoryLineResponse(BaseModel):
    instance_line_id: int
    quantity: int
    quantity_missing: int
