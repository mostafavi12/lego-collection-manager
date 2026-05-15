from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures" / "csv"


def test_post_csv_import_creates_instances(api_client) -> None:
    content = (FIXTURES / "valid_comma.txt").read_text(encoding="utf-8")
    response = api_client.post(
        "/api/imports/csv",
        files={"file": ("sets.txt", content.encode("utf-8"), "text/plain")},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["instances_created"] == 3
    assert body["catalog_stubs_created"] == 3
    assert body["errors"] == []


def test_post_csv_returns_token_errors(api_client) -> None:
    content = (FIXTURES / "with_errors.txt").read_text(encoding="utf-8")
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


def test_post_csv_rejects_non_utf8(api_client) -> None:
    response = api_client.post(
        "/api/imports/csv",
        files={"file": ("sets.txt", b"\xff\xfe", "text/plain")},
    )
    assert response.status_code == 400


def test_post_csv_rejects_oversized_file(api_client, monkeypatch) -> None:
    import app.api.routes.imports as imports_route

    monkeypatch.setattr(imports_route, "MAX_CSV_BYTES", 10)
    response = api_client.post(
        "/api/imports/csv",
        files={"file": ("sets.txt", b"0" * 20, "text/plain")},
    )
    assert response.status_code == 413
