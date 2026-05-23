from tests.factories import (
    add_catalog_set,
    add_color,
    add_missing_item_for_set_line,
    add_owned_set,
    add_part,
    add_set_part_inventory_line,
)


def test_missing_parts_empty_collection(api_client) -> None:
    response = api_client.get("/api/reports/missing-parts")
    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


def test_missing_parts_aggregates_across_sets(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    part = add_part(db_session, part_num="3001")
    color = add_color(db_session)
    line = add_set_part_inventory_line(
        db_session,
        catalog_set=catalog,
        part=part,
        color=color,
        quantity=4,
    )
    owned_a = add_owned_set(db_session, catalog, label="copy A")
    owned_b = add_owned_set(db_session, catalog, label="copy B")
    add_missing_item_for_set_line(
        db_session,
        owned_set=owned_a,
        line=line,
        quantity_missing=2,
    )
    add_missing_item_for_set_line(
        db_session,
        owned_set=owned_b,
        line=line,
        quantity_missing=1,
    )
    db_session.commit()

    response = api_client.get("/api/reports/missing-parts")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    item = body["items"][0]
    assert item["part_num"] == "3001"
    assert item["quantity_missing_total"] == 3
    assert len(item["needed_sets"]) == 2
    by_id = {row["owned_set_id"]: row for row in item["needed_sets"]}
    assert by_id[owned_a.id]["quantity_missing"] == 2
    assert by_id[owned_b.id]["quantity_missing"] == 1


def test_missing_parts_filters_by_owned_set_ids(api_client, db_session) -> None:
    catalog_a = add_catalog_set(db_session, set_number=1001)
    catalog_b = add_catalog_set(db_session, set_number=1002)
    part = add_part(db_session, part_num="3001")
    color = add_color(db_session)
    line_a = add_set_part_inventory_line(
        db_session, catalog_set=catalog_a, part=part, color=color
    )
    line_b = add_set_part_inventory_line(
        db_session, catalog_set=catalog_b, part=part, color=color
    )
    owned_a = add_owned_set(db_session, catalog_a)
    owned_b = add_owned_set(db_session, catalog_b)
    add_missing_item_for_set_line(db_session, owned_set=owned_a, line=line_a, quantity_missing=2)
    add_missing_item_for_set_line(db_session, owned_set=owned_b, line=line_b, quantity_missing=1)
    db_session.commit()

    filtered = api_client.get(
        "/api/reports/missing-parts",
        params=[("owned_set_ids", owned_a.id)],
    )
    assert filtered.status_code == 200
    body = filtered.json()
    assert body["total"] == 1
    assert body["items"][0]["quantity_missing_total"] == 2
    assert len(body["items"][0]["needed_sets"]) == 1
    assert body["items"][0]["needed_sets"][0]["owned_set_id"] == owned_a.id


def test_missing_parts_pagination(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    color = add_color(db_session)
    owned = add_owned_set(db_session, catalog)
    for idx, part_num in enumerate(("3001", "3002")):
        part = add_part(db_session, part_num=part_num)
        line = add_set_part_inventory_line(
            db_session,
            catalog_set=catalog,
            part=part,
            color=color,
        )
        add_missing_item_for_set_line(db_session, owned_set=owned, line=line)
    db_session.commit()

    page_one = api_client.get("/api/reports/missing-parts", params={"limit": 1, "offset": 0})
    page_two = api_client.get("/api/reports/missing-parts", params={"limit": 1, "offset": 1})

    assert page_one.status_code == 200
    assert page_two.status_code == 200
    assert page_one.json()["total"] == 2
    assert len(page_one.json()["items"]) == 1
    assert len(page_two.json()["items"]) == 1
    assert page_one.json()["items"][0]["part_num"] != page_two.json()["items"][0]["part_num"]
