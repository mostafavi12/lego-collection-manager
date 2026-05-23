import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportPage } from "./ImportPage";
import { renderWithAppMode } from "../test/renderWithAppMode";

function renderImport(mode: "view" | "edit" = "edit") {
  return renderWithAppMode(<ImportPage />, { mode });
}

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
        existing_sets_skipped: 0,
        skipped_existing_sets: [],
        sets_failed: [],
        errors: [],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderImport();

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
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    const body = requestInit.body as FormData;
    expect(body.get("existing_set_mode")).toBe("skip");

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("2");
    expect(status).toHaveTextContent("instance");
  });

  it("shows skipped existing sets in the import report", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        instances_created: 0,
        catalog_stubs_created: 0,
        sets_fetched: 0,
        existing_sets_skipped: 1,
        skipped_existing_sets: [{ token_index: 0, set_num: "6024-1" }],
        sets_failed: [],
        errors: [],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderImport();

    const file = new File(["6024-1"], "sets.csv", { type: "text/plain" });
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(fileInput, file);
    await user.click(screen.getByRole("button", { name: /import csv/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      /not imported because .* already exist in your collection/i,
    );
    expect(status).toHaveTextContent("6024-1");
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get("existing_set_mode")).toBe("skip");
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
        minifig_images_downloaded: 1,
        part_images_downloaded: 1,
        image_downloads_failed: [],
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderImport();

    expect(screen.getByLabelText(/download set images/i)).toBeChecked();
    expect(screen.getByLabelText(/do not download images for parts/i)).toBeChecked();
    await user.click(screen.getByLabelText(/download part images for all sets/i));
    await user.click(screen.getByRole("button", { name: /sync entire collection/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/imports/rebrickable/sync"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            download_set_images: true,
            part_image_download_mode: "all",
          }),
        }),
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Downloaded 1 set image");
  });

  it("can update missing ages and themes from local metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        owned_set_ages_updated: 2,
        catalog_themes_updated: 1,
        age_values_available: 400,
        theme_values_available: 26000,
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderImport();

    await user.click(screen.getByRole("button", { name: /update missing ages and themes/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/imports/local-metadata"),
        expect.objectContaining({ method: "POST" }),
      );
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Updated 2 age values and 1 theme");
  });

  it("hides import forms in view mode", () => {
    renderImport("view");
    expect(screen.getByText(/edit mode/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /import csv/i }),
    ).not.toBeInTheDocument();
  });
});
