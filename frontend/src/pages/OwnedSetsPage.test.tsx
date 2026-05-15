import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OwnedSetsPage } from "./OwnedSetsPage";
import { ownedSetListFixture } from "../test/fixtures";

function renderPage() {
  return render(
    <MemoryRouter>
      <OwnedSetsPage />
    </MemoryRouter>,
  );
}

describe("OwnedSetsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders owned sets from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ownedSetListFixture,
      } as Response),
    );

    renderPage();

    expect(await screen.findByText(/copy A/)).toBeInTheDocument();
    expect(screen.getByText(/1 missing/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /6024-1/i })).toHaveLength(2);
  });

  it("calls duplicate endpoint when Add copy is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ownedSetListFixture,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ...ownedSetListFixture.items[0],
          id: 9,
          duplicated_from_owned_set_id: 1,
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole("button", { name: /add copy/i });
    await user.click(buttons[0]!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets/1/duplicate"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
