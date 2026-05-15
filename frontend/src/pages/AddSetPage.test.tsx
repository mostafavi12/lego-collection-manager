import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddSetWizard } from "../components/AddSetWizard";

describe("AddSetWizard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows set number step then creates a new set", async () => {
    const onCreated = vi.fn();
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
          theme_name: null,
          year: null,
          num_parts: null,
          age: null,
          image_url: null,
          set_parts: [],
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
        <AddSetWizard onClose={() => {}} onCreated={onCreated} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/lego set number/i), "8888-1");
    await user.click(screen.getByRole("button", { name: /^next$/i }));

    expect(
      await screen.findByRole("heading", { name: /new set — 8888-1/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(9);
    });
  });
});
