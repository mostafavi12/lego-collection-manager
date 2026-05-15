from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from app.rebrickable.dto import CatalogSetDTO, ThemeDTO
from tests.test_rebrickable_sync_service import FakeRebrickableClient, _sample_set

FIXTURES = Path(__file__).parent / "fixtures" / "csv"


def _csv_fake_client() -> FakeRebrickableClient:
    def set_dto(num: str, name: str) -> CatalogSetDTO:
        return replace(_sample_set(), set_num=num, name=name)

    return FakeRebrickableClient(
        sets={
            "6024-1": set_dto("6024-1", "Police Car"),
            "10281-1": set_dto("10281-1", "Other"),
            "21309-1": set_dto("21309-1", "Third"),
        },
        themes={67: ThemeDTO(external_id=67, name="Town")},
        set_parts={"6024-1": [], "10281-1": [], "21309-1": []},
    )


def _patch_csv_import(fake: FakeRebrickableClient):
    from app.importers.csv_import_service import import_set_list

    def stub(session, content, *, client=None):
        return import_set_list(session, content, client=fake)

    return patch("app.api.routes.imports.import_set_list", stub)


def test_post_csv_import_requires_api_key(api_client, monkeypatch) -> None:
    monkeypatch.delenv("REBRICKABLE_API_KEY", raising=False)
    content = (FIXTURES / "valid_comma.txt").read_text(encoding="utf-8")
    response = api_client.post(
        "/api/imports/csv",
        files={"file": ("sets.txt", content.encode("utf-8"), "text/plain")},
    )
    assert response.status_code == 400
    assert "REBRICKABLE_API_KEY" in response.json()["detail"]


def test_post_csv_import_creates_instances(api_client, monkeypatch) -> None:
    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    content = (FIXTURES / "valid_comma.txt").read_text(encoding="utf-8")
    with _patch_csv_import(_csv_fake_client()):
        response = api_client.post(
            "/api/imports/csv",
            files={"file": ("sets.txt", content.encode("utf-8"), "text/plain")},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["instances_created"] == 3
    assert body["sets_fetched"] == 3
    assert body["catalog_stubs_created"] == 0
    assert body["errors"] == []


def test_post_csv_returns_token_errors(api_client, monkeypatch) -> None:
    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    content = (FIXTURES / "with_errors.txt").read_text(encoding="utf-8")
    with _patch_csv_import(_csv_fake_client()):
        response = api_client.post(
            "/api/imports/csv",
            files={"file": ("sets.txt", content.encode("utf-8"), "text/plain")},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["instances_created"] == 2
    assert len(body["errors"]) == 2
    assert body["errors"][0]["token_index"] == 1
    assert "token_index" in body["errors"][0]
    assert "raw" in body["errors"][0]
    assert "message" in body["errors"][0]


def test_post_csv_rejects_non_utf8(api_client, monkeypatch) -> None:
    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    response = api_client.post(
        "/api/imports/csv",
        files={"file": ("sets.txt", b"\xff\xfe", "text/plain")},
    )
    assert response.status_code == 400


def test_post_csv_rejects_oversized_file(api_client, monkeypatch) -> None:
    import app.api.routes.imports as imports_route

    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    monkeypatch.setattr(imports_route, "MAX_CSV_BYTES", 10)
    response = api_client.post(
        "/api/imports/csv",
        files={"file": ("sets.txt", b"0" * 20, "text/plain")},
    )
    assert response.status_code == 413
