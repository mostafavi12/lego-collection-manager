"""Upload directory settings for missing-part images."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_UPLOAD_ROOT = "./data/uploads"
DEFAULT_MAX_MISSING_IMAGE_BYTES = 5 * 1024 * 1024

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


def get_upload_root() -> Path:
    raw = os.environ.get("UPLOAD_ROOT", DEFAULT_UPLOAD_ROOT)
    path = Path(raw)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_max_missing_image_bytes() -> int:
    return int(os.environ.get("MISSING_IMAGE_MAX_BYTES", DEFAULT_MAX_MISSING_IMAGE_BYTES))
