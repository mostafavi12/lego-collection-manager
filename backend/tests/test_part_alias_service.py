"""Symmetric part alias closure (Phase 11B)."""

from sqlalchemy import select

from app.db.models import Part, PartAlias
from app.services.part_alias_service import PartAliasError, replace_part_aliases
from tests.factories import add_part, add_part_alias


def test_add_b_to_x_adds_x_to_b(db_session) -> None:
    part_x = add_part(db_session, part_num="3024")
    part_b = add_part(db_session, part_num="3024b")
    db_session.commit()

    replace_part_aliases(db_session, part_x.id, ["3024b"])
    db_session.commit()

    b_aliases = db_session.scalars(
        select(PartAlias.alias).where(
            PartAlias.part_id == part_b.id,
            PartAlias.source == "user",
        )
    ).all()
    assert "3024" in b_aliases


def test_remove_a_from_x_removes_x_from_a(db_session) -> None:
    part_x = add_part(db_session, part_num="3024")
    part_a = add_part(db_session, part_num="3024a")
    replace_part_aliases(db_session, part_x.id, ["3024a"])
    db_session.commit()

    replace_part_aliases(db_session, part_x.id, [])
    db_session.commit()

    a_aliases = db_session.scalars(
        select(PartAlias).where(PartAlias.part_id == part_a.id, PartAlias.source == "user")
    ).all()
    assert a_aliases == []


def test_merge_classes_when_alias_matches_part_num(db_session) -> None:
    part_a = add_part(db_session, part_num="100")
    part_b = add_part(db_session, part_num="200")
    add_part_alias(db_session, part_b, "legacy")
    db_session.commit()

    replace_part_aliases(db_session, part_a.id, ["200"])
    db_session.commit()

    rows = db_session.scalars(select(PartAlias).where(PartAlias.source == "user")).all()
    by_part: dict[int, list[str]] = {}
    for row in rows:
        by_part.setdefault(row.part_id, []).append(row.alias)
    assert "200" in by_part[part_a.id]
    assert "100" in by_part[part_b.id]


def test_replace_list_drops_removed_strings(db_session) -> None:
    part = add_part(db_session, part_num="9999")
    db_session.commit()

    replace_part_aliases(db_session, part.id, ["alt1", "alt2"])
    replace_part_aliases(db_session, part.id, ["alt2"])
    db_session.commit()

    aliases = db_session.scalars(
        select(PartAlias.alias).where(
            PartAlias.part_id == part.id,
            PartAlias.source == "user",
        )
    ).all()
    assert aliases == ["alt2"]


def test_unknown_part_raises(db_session) -> None:
    try:
        replace_part_aliases(db_session, 99999, ["x"])
    except PartAliasError as exc:
        assert exc.status_code == 404
    else:
        raise AssertionError("expected PartAliasError")
