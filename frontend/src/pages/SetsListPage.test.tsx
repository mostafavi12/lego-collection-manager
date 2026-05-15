import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetsListPage } from "./SetsListPage";
import { setCopyListFixture } from "../test/fixtures";

function renderPage() {
  return render(
    <MemoryRouter>
      <SetsListPage />
    </MemoryRouter>,
  );
}

describe("SetsListPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders display label before set number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => setCopyListFixture,
      } as Response),
    );

    renderPage();

    expect(await screen.findByText(/6024-1 \(Police Car\) - copy A/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /make a copy/i })).toHaveLength(2);
  });

  it("opens make a copy dialog and posts on confirm", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => setCopyListFixture,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source_owned_set_id: 1,
          set_num: "6024-1",
          set_name: "Police Car",
          existing_copy_count: 2,
          suggested_label: "Copy #3",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ...setCopyListFixture.items[0],
          id: 9,
          label: "Copy #3",
          display_label: "Copy #3",
          copy_index: 3,
          duplicated_from_owned_set_id: 1,
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderPage();

    const makeCopyButtons = await screen.findAllByRole("button", {
      name: /make a copy/i,
    });
    await user.click(makeCopyButtons[0]!);

    expect(
      await screen.findByText(/creating a copy of lego set number/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Copy #3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create a copy/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets/1/duplicate"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ label: "Copy #3" }),
        }),
      );
    });
  });
});
