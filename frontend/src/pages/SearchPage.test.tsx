import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "./SearchPage";
import { searchFixture } from "../test/fixtures";

describe("SearchPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits search and shows set results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => searchFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SearchPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/search query/i), "6024");
    await user.click(screen.getByRole("button", { name: /search/i }));

    expect(await screen.findByText(/Sets \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/copy A/)).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/search?q=6024"),
        undefined,
      );
    });
  });
});
