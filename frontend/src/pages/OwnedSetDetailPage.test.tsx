import { render, screen, waitFor } from "@testing-library/react";
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

    expect(await screen.findByRole("heading", { name: /6024-1/i })).toBeInTheDocument();
    expect(screen.getByText(/Plate 1 x 1/)).toBeInTheDocument();
    expect(screen.getByLabelText(/missing quantity for 3024/i)).toHaveValue(1);
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
    await user.click(saveButtons[0]!);

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
});
