import { describe, expect, it } from "vitest";

import { partPhotoDisplayUrl } from "./partPhotoDisplay";

describe("partPhotoDisplayUrl", () => {
  it("prefers part blob over element line url", () => {
    expect(
      partPhotoDisplayUrl({
        part_image_url: "/api/parts/1/image",
        image_url: "/api/elements/302400/image",
      }),
    ).toBe("/api/parts/1/image");
  });

  it("uses line url when no part blob and not user-removed", () => {
    expect(
      partPhotoDisplayUrl({
        part_image_url: null,
        image_url: "/api/elements/302400/image",
      }),
    ).toBe("/api/elements/302400/image");
  });

  it("returns null when user removed part photo", () => {
    expect(
      partPhotoDisplayUrl({
        part_image_url: null,
        image_url: "/api/elements/302400/image",
        part_image_user_removed: true,
      }),
    ).toBeNull();
  });
});
