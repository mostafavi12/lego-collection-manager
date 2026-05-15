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

  it("includes manual part rows in POST for a new catalog", async () => {
    const onCreated = vi.fn();
    const preview = {
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
    };
    const createJson = {
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
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => preview,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createJson,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddSetWizard onClose={() => {}} onCreated={onCreated} />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/lego set number/i), "8888-1");
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await screen.findByRole("heading", { name: /new set — 8888-1/i });

    await user.type(screen.getByLabelText(/^part #/i), "3024");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(9);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const postInit = fetchMock.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(String(postInit.body)) as {
      parts?: { part_num: string; quantity: number }[];
    };
    expect(body.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ part_num: "3024", quantity: 1 }),
      ]),
    );
  });

  it("Fetch from Rebrickable applies draft fields", async () => {
    const onCreated = vi.fn();
    const preview = {
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
    };
    const draft = {
      set_num: "8888-1",
      catalog: {
        name: "RB Set",
        theme_name: "Classic",
        year: 1985,
        num_parts: 100,
      },
      age: 8,
      parts: [
        {
          part_num: "3001",
          part_name: "Brick",
          color_id: 0,
          color_name: "Black",
          quantity: 4,
        },
      ],
      note: "Set-level parts only.",
    };
    const createJson = {
      catalog_created: true,
      id: 12,
      set_num: "8888-1",
      name: "RB Set",
      year: 1985,
      theme_name: "Classic",
      image_url: null,
      catalog_sync_state: "pending",
      investigated: false,
      label: "Copy #1",
      display_label: "Copy #1",
      copy_index: 1,
      age: 8,
      num_parts: 100,
      missing_count: 0,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => preview,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => draft,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createJson,
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddSetWizard onClose={() => {}} onCreated={onCreated} />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/lego set number/i), "8888-1");
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(
      screen.getByRole("button", { name: /fetch from rebrickable/i }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/lego set name/i)).toHaveValue("RB Set");
    });
    expect(screen.getByLabelText(/^theme$/i)).toHaveValue("Classic");
    expect(screen.getByLabelText(/^year$/i)).toHaveValue(1985);
    expect(screen.getByLabelText(/number of parts/i)).toHaveValue(100);
    expect(screen.getByLabelText(/^age$/i)).toHaveValue(8);
    expect(screen.getByRole("status")).toHaveTextContent(/set-level/i);

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(12);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
