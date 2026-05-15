import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddSetPage } from "./AddSetPage";

describe("AddSetPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates a new set after preview", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          set_num: "8888-1",
          catalog_exists: false,
          set_name: null,
          existing_copy_count: 0,
          suggested_label: "Copy #1",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          catalog_created: true,
          id: 9,
          set_num: "8888-1",
          name: null,
          year: null,
          theme_name: null,
          image_url: null,
          catalog_sync_state: "pending",
          investigated: false,
          label: "Copy #1",
          display_label: "Copy #1",
          copy_index: 1,
          age: null,
          num_parts: null,
          missing_count: 0,
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddSetPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText(/6024-1/i), "8888-1");
    await user.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(await screen.findByRole("heading", { name: /new set 8888-1/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create set/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/owned-sets"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
