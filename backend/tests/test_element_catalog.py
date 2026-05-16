from app.services.element_catalog import clear_element_catalog_cache, load_element_catalog


def test_element_catalog_maps_part_and_color_to_multiple_element_ids(tmp_path) -> None:
    path = tmp_path / "elements.csv"
    path.write_text(
        "element_id,part_num,color_id,design_id\n"
        "302400,3024,0,3024\n"
        "6252045,3024,0,3024\n"
        "300121,3001,4,3001\n",
        encoding="utf-8",
    )
    clear_element_catalog_cache()

    catalog = load_element_catalog(str(path))

    assert catalog.element_ids_for("3024", 0) == ("302400", "6252045")
    assert catalog.element_ids_for("3024", 4) == ()
    clear_element_catalog_cache()
