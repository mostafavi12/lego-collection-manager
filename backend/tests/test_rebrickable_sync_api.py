from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.importers.rebrickable_sync_service import RebrickableSyncResult, SetSyncFailure
from tests.factories import add_catalog_set, add_owned_set


def test_post_sync_requires_api_key(api_client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("REBRICKABLE_API_KEY", raising=False)
    response = api_client.post("/api/imports/rebrickable/sync", json={})
    assert response.status_code == 400
    assert "REBRICKABLE_API_KEY" in response.json()["detail"]


def test_post_sync_success(api_client, db_session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    catalog = add_catalog_set(db_session)
    owned = add_owned_set(db_session, catalog)
    db_session.commit()

    mock_result = RebrickableSyncResult(
        sets_synced=1,
        sets_failed=[],
        parts_upserted=3,
        inventory_lines_written=5,
    )

    with patch(
        "app.api.routes.imports.sync_rebrickable",
        return_value=mock_result,
    ) as mock_sync:
        response = api_client.post(
            "/api/imports/rebrickable/sync",
            json={"owned_set_ids": [owned.id]},
        )

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "sets_synced": 1,
        "sets_failed": [],
        "parts_upserted": 3,
        "inventory_lines_written": 5,
    }
    mock_sync.assert_called_once()
    assert mock_sync.call_args.kwargs["owned_set_ids"] == [owned.id]


def test_post_sync_empty_body_syncs_all(
    api_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    mock_result = RebrickableSyncResult()

    with patch(
        "app.api.routes.imports.sync_rebrickable",
        return_value=mock_result,
    ) as mock_sync:
        response = api_client.post("/api/imports/rebrickable/sync")

    assert response.status_code == 200
    mock_sync.assert_called_once()
    assert mock_sync.call_args.kwargs["owned_set_ids"] is None


def test_post_sync_returns_failures(api_client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REBRICKABLE_API_KEY", "test-key")
    mock_result = RebrickableSyncResult(
        sets_synced=0,
        sets_failed=[SetSyncFailure(set_num="bad-1", message="HTTP 404 from Rebrickable")],
        parts_upserted=0,
        inventory_lines_written=0,
    )

    with patch(
        "app.api.routes.imports.sync_rebrickable",
        return_value=mock_result,
    ):
        response = api_client.post("/api/imports/rebrickable/sync", json={})

    assert response.status_code == 200
    body = response.json()
    assert body["sets_failed"] == [
        {"set_num": "bad-1", "message": "HTTP 404 from Rebrickable"}
    ]
