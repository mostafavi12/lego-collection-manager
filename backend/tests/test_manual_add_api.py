"""Manual add owned set API."""

from tests.factories import add_catalog_set, add_color, add_owned_set, add_part, add_set_part_inventory_line


def test_add_preview_new_set_num(api_client) -> None:
    response = api_client.get("/api/owned-sets/add-preview", params={"set_num": "9999-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["catalog_exists"] is False
    assert body["set_num"] == "9999-1"
    assert body["suggested_label"] == "Copy #1"


def test_add_preview_existing_set_num(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session, set_num="6024-1")
    part = add_part(db_session, part_num="3024")
    color = add_color(db_session, external_id=0, name="Black")
    add_set_part_inventory_line(
        db_session,
        catalog_set=catalog,
        part=part,
        color=color,
        quantity=3,
    )
    add_owned_set(db_session, catalog, label="copy A")
    db_session.commit()

    response = api_client.get("/api/owned-sets/add-preview", params={"set_num": "6024-1"})
    assert response.status_code == 200
    body = response.json()
    assert body["catalog_exists"] is True
    assert body["set_name"] == "Police Car"
    assert body["existing_copy_count"] == 1
    assert body["suggested_label"] == "Copy #2"
    assert len(body["set_parts"]) == 1
    assert body["set_parts"][0]["part_num"] == "3024"


def test_create_new_set_stub(api_client, db_session) -> None:
    response = api_client.post("/api/owned-sets", json={"set_num": "8888-1"})
    assert response.status_code == 201
    body = response.json()
    assert body["catalog_created"] is True
    assert body["set_num"] == "8888-1"
    assert body["investigated"] is False
    assert body["display_label"] == "Copy #1"

    detail = api_client.get(f"/api/owned-sets/{body['id']}")
    assert detail.status_code == 200


def test_create_new_set_with_catalog_and_parts(api_client, db_session) -> None:
    response = api_client.post(
        "/api/owned-sets",
        json={
            "set_num": "7777-1",
            "catalog": {
                "name": "Custom Set",
                "theme_name": "Town",
                "year": 1985,
                "num_parts": 2,
            },
            "parts": [
                {
                    "part_num": "3024",
                    "part_name": "Plate 1 x 1",
                    "color_id": 0,
                    "color_name": "Black",
                    "quantity": 2,
                }
            ],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Custom Set"
    assert body["theme_name"] == "Town"

    detail = api_client.get(f"/api/owned-sets/{body['id']}").json()
    assert len(detail["inventory"]["set_parts"]) == 1
    assert detail["inventory"]["set_parts"][0]["part_num"] == "3024"
    assert detail["inventory"]["set_parts"][0]["quantity"] == 2


def test_create_additional_copy(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session, set_num="6024-1")
    part = add_part(db_session, part_num="3024")
    color = add_color(db_session, external_id=0, name="Black")
    add_set_part_inventory_line(
        db_session,
        catalog_set=catalog,
        part=part,
        color=color,
        quantity=4,
    )
    add_owned_set(db_session, catalog)
    db_session.commit()

    response = api_client.post(
        "/api/owned-sets",
        json={"set_num": "6024-1", "label": "Copy #2"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["catalog_created"] is False
    assert body["label"] == "Copy #2"

    detail = api_client.get(f"/api/owned-sets/{body['id']}").json()
    assert len(detail["inventory"]["set_parts"]) == 1


def test_create_copy_rejects_catalog_body(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session, set_num="6024-1")
    add_owned_set(db_session, catalog)
    db_session.commit()

    response = api_client.post(
        "/api/owned-sets",
        json={"set_num": "6024-1", "catalog": {"name": "Nope"}},
    )
    assert response.status_code == 400
