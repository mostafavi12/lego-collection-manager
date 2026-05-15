from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.db.models import (
    CatalogMinifig,
    CatalogSet,
    Part,
    SetMinifigInventoryLine,
    SetPartInventoryLine,
)
from app.importers.rebrickable_sync_service import (
    RebrickableSyncResult,
    sync_catalog_for_set_nums,
)
from app.rebrickable.dto import (
    CatalogSetDTO,
    ColorDTO,
    MinifigPartLineDTO,
    PartDTO,
    SetMinifigLineDTO,
    SetPartLineDTO,
    ThemeDTO,
)
from app.rebrickable.exceptions import RebrickableAPIError
from tests.factories import add_catalog_set, add_owned_set


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FakeRebrickableClient:
    def __init__(
        self,
        *,
        sets: dict[str, CatalogSetDTO] | None = None,
        themes: dict[int, ThemeDTO] | None = None,
        set_parts: dict[str, list[SetPartLineDTO]] | None = None,
        set_minifigs: dict[str, list[SetMinifigLineDTO]] | None = None,
        minifig_parts: dict[str, list[MinifigPartLineDTO]] | None = None,
        fail_set_nums: set[str] | None = None,
    ) -> None:
        self.sets = sets or {}
        self.themes = themes or {}
        self.set_parts = set_parts or {}
        self.set_minifigs = set_minifigs or {}
        self.minifig_parts = minifig_parts or {}
        self.fail_set_nums = fail_set_nums or set()

    def get_set(self, set_num: str) -> CatalogSetDTO:
        if set_num in self.fail_set_nums:
            raise RebrickableAPIError("not found", status_code=404)
        return self.sets[set_num]

    def get_theme(self, theme_id: int) -> ThemeDTO:
        return self.themes[theme_id]

    def iter_set_parts(self, set_num: str):
        yield from self.set_parts.get(set_num, [])

    def iter_set_minifigs(self, set_num: str):
        yield from self.set_minifigs.get(set_num, [])

    def iter_minifig_parts(self, minifig_num: str):
        yield from self.minifig_parts.get(minifig_num, [])


def _sample_set() -> CatalogSetDTO:
    return CatalogSetDTO(
        set_num="6024-1",
        name="Police Car",
        year=1980,
        theme_external_id=67,
        num_parts=24,
        image_url="https://cdn.rebrickable.com/media/sets/6024-1.jpg",
    )


def _sample_part_line(
    part_num: str = "3024",
    *,
    is_spare: bool = False,
) -> SetPartLineDTO:
    return SetPartLineDTO(
        part=PartDTO(part_num=part_num, name="Plate", image_url=None, aliases=()),
        color=ColorDTO(external_id=0, name="Black", rgb="05131D"),
        quantity=4,
        is_spare=is_spare,
        is_alternate=False,
        image_url=None,
        inventory_id=100,
    )


@pytest.fixture
def fake_client() -> FakeRebrickableClient:
    return FakeRebrickableClient(
        sets={"6024-1": _sample_set()},
        themes={67: ThemeDTO(external_id=67, name="Town")},
        set_parts={"6024-1": [_sample_part_line("3024"), _sample_part_line("3005", is_spare=True)]},
        set_minifigs={
            "6024-1": [
                SetMinifigLineDTO(
                    minifig_num="cop01",
                    name="Police Officer",
                    image_url=None,
                    quantity=1,
                )
            ]
        },
        minifig_parts={
            "cop01": [
                MinifigPartLineDTO(
                    part=PartDTO(part_num="973", name="Torso", image_url=None),
                    color=ColorDTO(external_id=0, name="Black", rgb=None),
                    quantity=1,
                    is_spare=False,
                    image_url=None,
                )
            ]
        },
    )


def test_sync_populates_catalog(db_session, fake_client) -> None:
    catalog = add_catalog_set(db_session, set_num="6024-1")
    add_owned_set(db_session, catalog)
    db_session.commit()

    result = sync_catalog_for_set_nums(db_session, fake_client, ["6024-1"])
    db_session.commit()

    assert result.sets_synced == 1
    assert result.sets_failed == []
    assert result.parts_upserted >= 2
    assert result.inventory_lines_written >= 4

    updated = db_session.scalar(select(CatalogSet).where(CatalogSet.set_num == "6024-1"))
    assert updated is not None
    assert updated.name == "Police Car"
    assert updated.source == "rebrickable"
    assert db_session.scalar(select(func.count()).select_from(SetPartInventoryLine)) == 2
    assert db_session.scalar(select(func.count()).select_from(SetMinifigInventoryLine)) == 1
    assert db_session.scalar(select(func.count()).select_from(CatalogMinifig)) == 1


def test_second_sync_replaces_inventory(db_session, fake_client) -> None:
    catalog = add_catalog_set(db_session, set_num="6024-1")
    add_owned_set(db_session, catalog)
    db_session.commit()

    sync_catalog_for_set_nums(db_session, fake_client, ["6024-1"])
    db_session.commit()

    fake_client.set_parts["6024-1"] = [_sample_part_line("9999")]
    sync_catalog_for_set_nums(db_session, fake_client, ["6024-1"])
    db_session.commit()

    lines = db_session.scalars(select(SetPartInventoryLine)).all()
    assert len(lines) == 1
    part = db_session.scalar(select(Part).where(Part.part_num == "9999"))
    assert part is not None


def test_sync_records_failure_without_corrupting_other_set(db_session, fake_client) -> None:
    catalog_ok = add_catalog_set(db_session, set_num="6024-1")
    catalog_bad = add_catalog_set(db_session, set_num="bad-1")
    add_owned_set(db_session, catalog_ok)
    add_owned_set(db_session, catalog_bad)
    db_session.commit()

    fake_client.sets["bad-1"] = CatalogSetDTO(
        set_num="bad-1",
        name=None,
        year=None,
        theme_external_id=None,
        num_parts=None,
        image_url=None,
    )
    fake_client.fail_set_nums.add("bad-1")

    result = sync_catalog_for_set_nums(
        db_session, fake_client, ["6024-1", "bad-1"]
    )
    db_session.commit()

    assert result.sets_synced == 1
    assert len(result.sets_failed) == 1
    assert result.sets_failed[0].set_num == "bad-1"
    assert "404" in result.sets_failed[0].message

    ok_set = db_session.scalar(select(CatalogSet).where(CatalogSet.set_num == "6024-1"))
    assert ok_set is not None
    assert ok_set.name == "Police Car"
