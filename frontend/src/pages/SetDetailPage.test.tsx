import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetDetailPage } from "./SetDetailPage";
import { setCopyDetailFixture } from "../test/fixtures";

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/sets/1"]}>
      <Routes>
        <Route path="/sets/:id" element={<SetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SetDetailPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders catalog header and inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response),
    );

    renderDetail();

    expect(await screen.findByRole("heading", { name: /6024 \(Police Car\) - copy A/i })).toBeInTheDocument();
    expect(screen.getByText(/Plate 1 x 1/)).toBeInTheDocument();
    expect(screen.getByText("302400, 6252045")).toBeInTheDocument();
    expect(screen.getByLabelText(/missing quantity for 3024/i)).toHaveValue(1);
    expect(screen.queryByAltText(/missing 3024/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^photo$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove photo/i })).not.toBeInTheDocument();
    const syncPanel = screen
      .getByText(/sync from rebrickable/i)
      .closest("details");
    expect(syncPanel).not.toHaveAttribute("open");
  });

  it("renders minifigure part row images like set part rows", async () => {
    const detail = {
      ...setCopyDetailFixture,
      inventory: {
        ...setCopyDetailFixture.inventory,
        minifigs: [
          {
            line_id: 200,
            catalog_minifig_id: 12,
            minifig_num: "cop01",
            name: "Police Officer",
            image_url: "/api/catalog-minifigs/12/image",
            quantity: 1,
            parts: [
              {
                instance_line_id: 201,
                catalog_line_id: 301,
                part_id: 99,
                part_num: "973",
                part_name: "Torso",
                color_id: 14,
                color_name: "Yellow",
                quantity: 1,
                element_ids: ["973000"],
                image_url: null,
                part_image_url: "/api/parts/99/image",
                missing_quantity: 0,
                missing_item_id: null,
                missing_image_url: null,
              },
            ],
          },
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => detail,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(/Police Officer/);
    const partCell = screen
      .getByText("973", { selector: "strong" })
      .closest(".part-cell");
    expect(partCell).not.toBeNull();
    expect(partCell?.querySelector("img")).toHaveAttribute("src", "/api/parts/99/image");

    await user.click(screen.getByText("973", { selector: "strong" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /edit part/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^missing$/i)).toHaveValue(0);
    expect(
      within(dialog).queryByRole("button", { name: /^delete$/i }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /^update$/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets/1/inventory-lines/201"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"quantity":1'),
        }),
      );
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/parts/99/aliases"),
      expect.anything(),
    );
  });

  it("refreshes part row image after updating photo in part view", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:updated-part-preview"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(Date, "now").mockReturnValue(12345);
    const detail = {
      ...setCopyDetailFixture,
      inventory: {
        ...setCopyDetailFixture.inventory,
        set_parts: [
          {
            ...setCopyDetailFixture.inventory.set_parts[0]!,
            part_image_url: "/api/parts/42/image",
          },
        ],
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => detail,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance_line_id: 100,
          part_id: 42,
          catalog_line_id: 10,
          quantity: 4,
          quantity_missing: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          part_id: 42,
          part_num: "3024",
          aliases: ["3024b"],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image_url: "/api/parts/42/image" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => detail,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(/Plate 1 x 1/);
    const rowImage = document.querySelector(".part-cell__img");
    expect(rowImage).toHaveAttribute("src", "/api/parts/42/image");

    await user.click(screen.getByText("3024", { selector: "strong" }));
    const dialog = await screen.findByRole("dialog");
    const file = new File(["new pixels"], "new-part.png", { type: "image/png" });
    await user.upload(within(dialog).getByLabelText(/^part photo$/i), file);
    expect(within(dialog).getByAltText("Part 3024")).toHaveAttribute(
      "src",
      "blob:updated-part-preview",
    );
    await user.click(within(dialog).getByRole("button", { name: /^update$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(document.querySelector(".part-cell__img")).toHaveAttribute(
      "src",
      "/api/parts/42/image?v=12345",
    );
  });

  it("sync panel sends default set images and selected part image mode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sets_synced: 1,
          sets_failed: [],
          parts_upserted: 2,
          inventory_lines_written: 3,
          set_images_downloaded: 1,
          minifig_images_downloaded: 1,
          part_images_downloaded: 2,
          image_downloads_failed: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Copy details");
    await user.click(screen.getByText(/sync from rebrickable/i));
    expect(screen.getByLabelText(/download set images/i)).toBeChecked();
    expect(screen.getByLabelText(/do not download images for parts/i)).toBeChecked();

    await user.click(screen.getByLabelText(/download all part images/i));
    await user.click(screen.getByRole("button", { name: /sync this set/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/imports/rebrickable/sync"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            owned_set_ids: [1],
            download_set_images: true,
            part_image_download_mode: "all",
          }),
        }),
      );
    });
  });

  it("opens add part modal from toolbar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response),
    );

    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole("heading", { name: /6024 \(Police Car\) - copy A/i });
    await user.click(screen.getByRole("button", { name: /add part/i }));

    expect(
      await screen.findByRole("heading", { name: /add part/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  it("opens edit modal when clicking a part row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response),
    );

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(/Plate 1 x 1/);
    await user.click(screen.getByText(/Plate 1 x 1/));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /edit part/i }),
    ).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("3024")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^update$/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("patches set part on update from modal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance_line_id: 100,
          part_id: 42,
          catalog_line_id: 10,
          quantity: 5,
          quantity_missing: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          part_id: 42,
          part_num: "3024",
          aliases: ["3024b"],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(/Plate 1 x 1/);
    await user.click(screen.getByText(/Plate 1 x 1/));

    const dialog = await screen.findByRole("dialog");
    const qtyInput = within(dialog).getByLabelText(/quantity/i);
    await user.clear(qtyInput);
    await user.type(qtyInput, "5");
    await user.click(within(dialog).getByRole("button", { name: /^update$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets/1/set-parts/100"),
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"quantity":5'),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/parts/42/aliases"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("patches missing quantity on save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          owned_set_id: 1,
          missing_item_id: 5,
          updated_lines: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    const qtyInput = await screen.findByLabelText(/missing quantity for 3024/i);
    await user.clear(qtyInput);
    await user.type(qtyInput, "2");
    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    await user.click(saveButtons[1]!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets/1/missing"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            set_part_inventory_line_id: 10,
            quantity_missing: 2,
          }),
        }),
      );
    });
  });

  it("shows set number warning and restores on cancel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => setCopyDetailFixture,
      })) as typeof fetch,
    );

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Copy details");
    const setNumInput = (await screen.findAllByDisplayValue("6024"))[0]!;
    await user.clear(setNumInput);
    await user.type(setNumInput, "8888");
    const saveButton = (await screen.findAllByRole("button", { name: /save changes/i }))[0]!;
    await user.click(saveButton);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /change set number\?/i }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(setNumInput).toHaveValue("6024");
  });

  it("filters set parts to missing-only and sorts by element id", async () => {
    const detail = {
      ...setCopyDetailFixture,
      inventory: {
        ...setCopyDetailFixture.inventory,
        set_parts: [
          {
            ...setCopyDetailFixture.inventory.set_parts[0]!,
            instance_line_id: 100,
            part_num: "3024",
            color_name: "Black",
            element_ids: ["302400"],
            missing_quantity: 1,
          },
          {
            ...setCopyDetailFixture.inventory.set_parts[0]!,
            instance_line_id: 101,
            catalog_line_id: 11,
            part_id: 43,
            part_num: "3001",
            color_name: "Red",
            element_ids: ["300121"],
            missing_quantity: 0,
            missing_item_id: null,
          },
        ],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => detail,
      } as Response),
    );

    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole("heading", { name: /parts inventory/i });
    expect(screen.getByText("3001", { selector: "strong" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Missing parts only"));
    expect(screen.queryByText(/3001/)).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Missing parts only"));
    await user.selectOptions(screen.getByLabelText(/sort parts/i), "element_id");
    const partLabels = screen.getAllByText(/^(3024|3001)$/, { selector: "strong" });
    expect(partLabels[0]).toHaveTextContent("3001");
    expect(partLabels[1]).toHaveTextContent("3024");
  });

  it("deletes copy after confirmation", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return {
          ok: true,
          json: async () => ({ deleted: true, id: 1 }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => setCopyDetailFixture,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Copy details");
    const deleteCopyButton = (
      await screen.findAllByRole("button", { name: /delete this copy/i })
    )[0]!;
    await user.click(deleteCopyButton);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /delete this copy\?/i }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets/1"),
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
