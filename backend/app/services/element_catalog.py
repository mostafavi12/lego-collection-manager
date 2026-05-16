"""Import-time LEGO Element ID lookup from Rebrickable's elements.csv."""

from __future__ import annotations

import csv
import os
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True)
class ElementCatalog:
    by_part_color: dict[tuple[str, int], tuple[str, ...]]

    def element_ids_for(self, part_num: str, color_id: int) -> tuple[str, ...]:
        return self.by_part_color.get((part_num, color_id), ())


def default_elements_csv_path() -> Path:
    configured = os.environ.get("ELEMENTS_CSV_PATH")
    if configured:
        return Path(configured)
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "data" / "elements.csv"


@lru_cache(maxsize=4)
def load_element_catalog(path_text: str | None = None) -> ElementCatalog:
    path = Path(path_text) if path_text else default_elements_csv_path()
    if not path.exists():
        return ElementCatalog(by_part_color={})

    values: dict[tuple[str, int], list[str]] = defaultdict(list)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            part_num = (row.get("part_num") or "").strip()
            element_id = (row.get("element_id") or "").strip()
            color_text = (row.get("color_id") or "").strip()
            if not part_num or not element_id or not color_text:
                continue
            try:
                color_id = int(color_text)
            except ValueError:
                continue
            key = (part_num, color_id)
            if element_id not in values[key]:
                values[key].append(element_id)

    return ElementCatalog(
        by_part_color={key: tuple(ids) for key, ids in values.items()}
    )


def clear_element_catalog_cache() -> None:
    load_element_catalog.cache_clear()


def element_ids_for(part_num: str, color_id: int) -> tuple[str, ...]:
    return load_element_catalog().element_ids_for(part_num, color_id)
