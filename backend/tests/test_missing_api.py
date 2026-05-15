from pathlib import Path

import pytest
from sqlalchemy import select

from app.db.models import MissingItem
from tests.factories import (
    add_catalog_set,
    add_color,
    add_missing_item_for_set_line,
    add_owned_set,
    add_part,
    add_set_part_inventory_line,
)

# Minimal 1x1 PNG
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xdb\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture
def upload_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "uploads"
    root.mkdir()
    monkeypatch.setenv("UPLOAD_ROOT", str(root))
    return root


def _seed_line(db_session, *, quantity: int = 4):
    catalog = add_catalog_set(db_session, set_num="6024-1")
    owned = add_owned_set(db_session, catalog)
    part = add_part(db_session, part_num="3024")
    color = add_color(db_session)
    line = add_set_part_inventory_line(
        db_session, catalog_set=catalog, part=part, color=color, quantity=quantity
    )
    db_session.commit()
    return owned, line


def test_patch_missing_creates(api_client, db_session, upload_root) -> None:
    owned, line = _seed_line(db_session)
    response = api_client.patch(
        f"/api/owned-sets/{owned.id}/missing",
        json={"set_part_inventory_line_id": line.id, "quantity_missing": 2},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["owned_set_id"] == owned.id
    assert body["missing_item_id"] > 0

    missing = db_session.get(MissingItem, body["missing_item_id"])
    assert missing is not None
    assert missing.quantity_missing == 2


def test_patch_missing_quantity_exceeds_inventory(api_client, db_session, upload_root) -> None:
    owned, line = _seed_line(db_session, quantity=3)
    response = api_client.patch(
        f"/api/owned-sets/{owned.id}/missing",
        json={"set_part_inventory_line_id": line.id, "quantity_missing": 5},
    )
    assert response.status_code == 400


def test_patch_missing_clear_removes_row_and_file(
    api_client, db_session, upload_root
) -> None:
    owned, line = _seed_line(db_session)
    missing = add_missing_item_for_set_line(
        db_session, owned_set=owned, line=line, image_path="1.jpg"
    )
    db_session.commit()

    (upload_root / "1.jpg").write_bytes(b"old")
    missing.image_path = "1.jpg"
    db_session.commit()

    response = api_client.patch(
        f"/api/owned-sets/{owned.id}/missing",
        json={"set_part_inventory_line_id": line.id, "quantity_missing": 0},
    )
    assert response.status_code == 200
    assert db_session.get(MissingItem, missing.id) is None
    assert not (upload_root / "1.jpg").exists()


def test_patch_missing_requires_exactly_one_line_ref(api_client, db_session, upload_root) -> None:
    owned, line = _seed_line(db_session)
    response = api_client.patch(
        f"/api/owned-sets/{owned.id}/missing",
        json={
            "set_part_inventory_line_id": line.id,
            "minifig_part_inventory_line_id": 99,
            "quantity_missing": 1,
        },
    )
    assert response.status_code == 422


def test_put_and_get_missing_image(api_client, db_session, upload_root) -> None:
    owned, line = _seed_line(db_session)
    create = api_client.patch(
        f"/api/owned-sets/{owned.id}/missing",
        json={"set_part_inventory_line_id": line.id, "quantity_missing": 1},
    )
    missing_id = create.json()["missing_item_id"]

    put = api_client.put(
        f"/api/owned-sets/{owned.id}/missing/{missing_id}/image",
        files={"file": ("part.png", TINY_PNG, "image/png")},
    )
    assert put.status_code == 200
    assert put.json()["missing_image_url"] == f"/api/media/missing/{missing_id}"

    get = api_client.get(f"/api/media/missing/{missing_id}")
    assert get.status_code == 200
    assert get.headers["content-type"].startswith("image/png")


def test_delete_image_keeps_missing_row(api_client, db_session, upload_root) -> None:
    owned, line = _seed_line(db_session)
    create = api_client.patch(
        f"/api/owned-sets/{owned.id}/missing",
        json={"set_part_inventory_line_id": line.id, "quantity_missing": 2},
    )
    missing_id = create.json()["missing_item_id"]
    api_client.put(
        f"/api/owned-sets/{owned.id}/missing/{missing_id}/image",
        files={"file": ("part.png", TINY_PNG, "image/png")},
    )

    delete = api_client.delete(
        f"/api/owned-sets/{owned.id}/missing/{missing_id}/image"
    )
    assert delete.status_code == 200
    assert delete.json()["missing_image_url"] is None

    missing = db_session.get(MissingItem, missing_id)
    assert missing is not None
    assert missing.quantity_missing == 2
    assert missing.image_path is None


def test_put_image_wrong_owned_set_returns_404(api_client, db_session, upload_root) -> None:
    owned_a, line_a = _seed_line(db_session)
    catalog_b = add_catalog_set(db_session, set_num="9999-1")
    owned_b = add_owned_set(db_session, catalog_b)
    db_session.commit()

    create = api_client.patch(
        f"/api/owned-sets/{owned_a.id}/missing",
        json={"set_part_inventory_line_id": line_a.id, "quantity_missing": 1},
    )
    missing_id = create.json()["missing_item_id"]

    response = api_client.put(
        f"/api/owned-sets/{owned_b.id}/missing/{missing_id}/image",
        files={"file": ("part.png", TINY_PNG, "image/png")},
    )
    assert response.status_code == 404


def test_get_media_not_found(api_client) -> None:
    assert api_client.get("/api/media/missing/99999").status_code == 404
