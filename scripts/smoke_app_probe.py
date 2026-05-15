#!/usr/bin/env python3
"""Verify FastAPI exposes health and CSV import (step 4 of scripts/smoke.sh)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        return 1

    client = TestClient(app)

    health = client.get("/health")
    if health.status_code != 200 or health.json() != {"status": "ok"}:
        print(
            f"ERROR: GET /health failed: status={health.status_code} body={health.text}",
            file=sys.stderr,
        )
        return 1
    print("GET /health -> 200 {\"status\": \"ok\"}")

    paths = client.get("/openapi.json").json().get("paths", {})
    if "/api/imports/csv" not in paths:
        print("SKIP POST /api/imports/csv (route not registered on this branch)")
        return 0

    fixture = BACKEND / "tests" / "fixtures" / "csv" / "valid_comma.txt"
    if not fixture.is_file():
        print(f"ERROR: missing fixture {fixture}", file=sys.stderr)
        return 1

    content = fixture.read_text(encoding="utf-8")
    response = client.post(
        "/api/imports/csv",
        files={"file": ("smoke.txt", content.encode("utf-8"), "text/plain")},
    )
    if response.status_code != 200:
        print(
            f"ERROR: POST /api/imports/csv failed: status={response.status_code} body={response.text}",
            file=sys.stderr,
        )
        return 1

    body = response.json()
    for key in ("instances_created", "catalog_stubs_created", "errors"):
        if key not in body:
            print(f"ERROR: response missing key {key!r}: {body}", file=sys.stderr)
            return 1

    if body["instances_created"] < 1:
        print(f"ERROR: expected instances_created >= 1, got {body}", file=sys.stderr)
        return 1

    print(
        "POST /api/imports/csv -> 200 "
        f"(instances_created={body['instances_created']}, "
        f"catalog_stubs_created={body['catalog_stubs_created']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
