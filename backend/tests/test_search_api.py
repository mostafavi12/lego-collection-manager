from tests.factories import (
    add_catalog_set,
    add_owned_set,
    add_part,
    add_part_alias,
    add_set_part_inventory_line,
    add_color,
)


def test_search_empty_query_returns_400(api_client) -> None:
    response = api_client.get("/api/search", params={"q": "  "})
    assert response.status_code == 400


def test_search_sets_by_prefix(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    owned = add_owned_set(db_session, catalog, label="A")
    db_session.commit()

    response = api_client.get("/api/search", params={"q": "6024", "type": "set"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["sets"]) == 1
    assert body["sets"][0]["owned_set_id"] == owned.id
    assert body["parts"] == []


def test_search_multiple_instances_same_set_num(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    add_owned_set(db_session, catalog, label="A")
    add_owned_set(db_session, catalog, label="B")
    db_session.commit()

    response = api_client.get("/api/search", params={"q": "6024", "type": "set"})
    assert len(response.json()["sets"]) == 2


def test_search_parts_by_part_num_and_alias(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session, set_number=1000)
    add_owned_set(db_session, catalog)
    part = add_part(db_session, part_num="3024")
    add_part_alias(db_session, part, "alias-3024")
    color = add_color(db_session)
    add_set_part_inventory_line(db_session, catalog_set=catalog, part=part, color=color)
    db_session.commit()

    by_num = api_client.get("/api/search", params={"q": "3024", "type": "part"})
    assert len(by_num.json()["parts"]) == 1
    p0 = by_num.json()["parts"][0]
    assert p0["lines"][0]["display_part_num"] == "3024"
    assert len(p0["lines"][0]["sets"]) == 1

    by_alias = api_client.get("/api/search", params={"q": "alias", "type": "part"})
    assert len(by_alias.json()["parts"]) == 1


def test_search_parts_includes_aliases_and_set_quantities(api_client, db_session) -> None:
    cat_a = add_catalog_set(db_session, set_number=65001)
    cat_b = add_catalog_set(db_session, set_number=30217)
    add_owned_set(db_session, cat_a)
    add_owned_set(db_session, cat_b)
    part = add_part(db_session, part_num="15598")
    add_part_alias(db_session, part, "3069b")
    color = add_color(db_session)
    add_set_part_inventory_line(
        db_session, catalog_set=cat_a, part=part, color=color, quantity=5
    )
    add_set_part_inventory_line(
        db_session, catalog_set=cat_b, part=part, color=color, quantity=1
    )
    db_session.commit()

    response = api_client.get("/api/search", params={"q": "15598", "type": "part"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["parts"]) == 1
    hit = body["parts"][0]
    assert hit["part_num"] == "15598"
    assert len(hit["lines"]) == 2
    assert hit["lines"][0]["display_part_num"] == "15598"
    assert hit["lines"][1]["display_part_num"] == "3069b"
    sets0 = {(s["set_num"], s["quantity"]) for s in hit["lines"][0]["sets"]}
    sets1 = {(s["set_num"], s["quantity"]) for s in hit["lines"][1]["sets"]}
    assert sets0 == {(65001, 5), (30217, 1)}
    assert sets0 == sets1


def test_search_type_all_returns_both_buckets(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    add_owned_set(db_session, catalog)
    part = add_part(db_session, part_num="6024plate")
    color = add_color(db_session, external_id=2, name="Blue")
    add_set_part_inventory_line(db_session, catalog_set=catalog, part=part, color=color)
    db_session.commit()

    response = api_client.get("/api/search", params={"q": "602", "type": "all"})
    body = response.json()
    assert len(body["sets"]) == 1
    assert len(body["parts"]) == 1
