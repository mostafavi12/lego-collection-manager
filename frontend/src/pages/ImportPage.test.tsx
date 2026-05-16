import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportPage } from "./ImportPage";

describe("ImportPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("posts CSV file to import endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        instances_created: 2,
        catalog_stubs_created: 0,
        sets_fetched: 2,
        sets_failed: [],
        errors: [],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );

    const file = new File(["6024-1,9999-1"], "sets.csv", { type: "text/plain" });
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: /import csv/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/imports/csv"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("2");
    expect(status).toHaveTextContent("instance");
  });

  it("passes selected image options to sync endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sets_synced: 1,
        sets_failed: [],
        parts_upserted: 2,
        inventory_lines_written: 3,
        set_images_downloaded: 1,
        part_images_downloaded: 1,
        image_downloads_failed: [],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ImportPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByLabelText(/download set images/i));
    await user.click(screen.getByLabelText(/download part images/i));
    await user.click(screen.getByRole("button", { name: /sync entire collection/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/imports/rebrickable/sync"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            download_set_images: true,
            download_missing_part_images: true,
          }),
        }),
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Downloaded 1 set image");
  });
});
