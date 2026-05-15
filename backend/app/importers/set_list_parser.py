"""Parse comma-separated owned set number text files."""

from __future__ import annotations

import re
from dataclasses import dataclass

SET_NUM_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]*$")


@dataclass(frozen=True)
class ParseError:
    token_index: int
    raw: str
    message: str


def tokenize_set_list(content: str) -> list[str]:
    """Split file content into set-number tokens (commas and whitespace)."""
    stripped = content.strip()
    if not stripped:
        return []
    tokens: list[str] = []
    for segment in stripped.split(","):
        parts = [part for part in re.split(r"\s+", segment) if part]
        if parts:
            tokens.extend(parts)
        else:
            tokens.append("")
    return tokens


def validate_set_num(token: str) -> str | None:
    trimmed = token.strip()
    if not trimmed:
        return "empty set number"
    if not SET_NUM_RE.match(trimmed):
        return "invalid set number format"
    return None


def parse_set_list(content: str) -> tuple[list[str], list[ParseError]]:
    tokens = tokenize_set_list(content)
    valid: list[str] = []
    errors: list[ParseError] = []
    for index, raw in enumerate(tokens):
        msg = validate_set_num(raw)
        if msg:
            errors.append(ParseError(token_index=index, raw=raw, message=msg))
        else:
            valid.append(raw.strip())
    return valid, errors
