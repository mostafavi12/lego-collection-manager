"""Temporary debug logging for agent sessions (NDJSON)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

_LOG_PATH = Path(__file__).resolve().parents[2] / ".cursor" / "debug-22d522.log"
_SESSION_ID = "22d522"


def debug_agent_log(
    *,
    location: str,
    message: str,
    data: dict[str, Any],
    hypothesis_id: str,
    run_id: str = "pre-fix",
) -> None:
    payload = {
        "sessionId": _SESSION_ID,
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    _LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        with _LOG_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, default=str) + "\n")
    except OSError:
        pass
