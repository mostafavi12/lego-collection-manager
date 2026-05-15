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

    by_alias = api_client.get("/api/search", params={"q": "alias", "type": "part"})
    assert len(by_alias.json()["parts"]) == 1


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
