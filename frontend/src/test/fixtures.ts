import type {
  OwnedSetDetailResponse,
  OwnedSetListResponse,
  SearchResponse,
} from "../api/types";

export const ownedSetListFixture: OwnedSetListResponse = {
  total: 2,
  items: [
    {
      id: 1,
      set_num: "6024-1",
      name: "Police Car",
      year: 1980,
      theme_name: "Town",
      image_url: null,
      catalog_sync_state: "ok",
      investigated: false,
      label: "copy A",
      display_label: "copy A",
      copy_index: 1,
      age: null,
      num_parts: 27,
      missing_count: 1,
    },
    {
      id: 2,
      set_num: "6024-1",
      name: "Police Car",
      year: 1980,
      theme_name: "Town",
      image_url: null,
      catalog_sync_state: "pending",
      investigated: true,
      label: null,
      display_label: "Copy #2",
      copy_index: 2,
      age: 8,
      num_parts: 27,
      missing_count: 0,
    },
  ],
};

export const ownedSetDetailFixture: OwnedSetDetailResponse = {
  id: 1,
  investigated: false,
  label: "copy A",
  display_label: "copy A",
  copy_index: 1,
  age: null,
  notes: null,
  catalog: {
    set_num: "6024-1",
    name: "Police Car",
    year: 1980,
    theme_name: "Town",
    image_url: null,
    num_parts: 27,
  },
  inventory: {
    set_parts: [
      {
        line_id: 10,
        part_num: "3024",
        part_name: "Plate 1 x 1",
        color_id: 0,
        color_name: "Black",
        quantity: 4,
        is_spare: false,
        is_alternate: false,
        image_url: null,
        missing_quantity: 1,
        missing_item_id: 5,
        missing_image_url: "/api/media/missing/5",
      },
    ],
    minifigs: [],
  },
};

export const searchFixture: SearchResponse = {
  sets: [
    {
      owned_set_id: 1,
      set_num: "6024-1",
      name: "Police Car",
      investigated: false,
      label: "copy A",
    },
  ],
  parts: [
    {
      part_num: "3024",
      name: "Plate 1 x 1",
      image_url: null,
    },
  ],
};
