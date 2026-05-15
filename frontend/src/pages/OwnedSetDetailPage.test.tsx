import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnedSetDetailPage } from "./OwnedSetDetailPage";
import { ownedSetDetailFixture } from "../test/fixtures";

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/sets/1"]}>
      <Routes>
        <Route path="/sets/:id" element={<OwnedSetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OwnedSetDetailPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders catalog header and inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ownedSetDetailFixture,
      } as Response),
    );

    renderDetail();

    expect(await screen.findByRole("heading", { name: /copy A — 6024-1/i })).toBeInTheDocument();
    expect(screen.getByText(/Plate 1 x 1/)).toBeInTheDocument();
    expect(screen.getByText("3024b")).toBeInTheDocument();
    expect(screen.getByLabelText(/missing quantity for 3024/i)).toHaveValue(1);
  });

  it("opens add part modal from toolbar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ownedSetDetailFixture,
      } as Response),
    );

    const user = userEvent.setup();
    renderDetail();

    await screen.findByRole("heading", { name: /copy A — 6024-1/i });
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
        json: async () => ownedSetDetailFixture,
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
        json: async () => ownedSetDetailFixture,
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
        json: async () => ownedSetDetailFixture,
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
        json: async () => ownedSetDetailFixture,
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
        json: async () => ownedSetDetailFixture,
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
        json: async () => ownedSetDetailFixture,
      })) as typeof fetch,
    );

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Instance details");
    const setNumInput = (await screen.findAllByDisplayValue("6024-1"))[0]!;
    await user.clear(setNumInput);
    await user.type(setNumInput, "8888-1");
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
    expect(setNumInput).toHaveValue("6024-1");
  });

  it("deletes instance after confirmation", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return {
          ok: true,
          json: async () => ({ deleted: true, id: 1 }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ownedSetDetailFixture,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Instance details");
    const deleteInstanceButton = (
      await screen.findAllByRole("button", { name: /delete instance/i })
    )[0]!;
    await user.click(deleteInstanceButton);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: /delete this instance\?/i }),
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
