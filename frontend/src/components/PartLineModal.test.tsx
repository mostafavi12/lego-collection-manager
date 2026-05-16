import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartLineModal } from "./PartLineModal";
import { setCopyDetailFixture } from "../test/fixtures";

const line = setCopyDetailFixture.inventory.set_parts[0]!;

describe("PartLineModal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows alias chips in edit mode", () => {
    render(
      <PartLineModal
        mode="edit"
        setCopyId={1}
        line={line}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText("3024b")).toBeInTheDocument();
    expect(screen.getByLabelText(/part aliases/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^missing$/i)).toHaveValue(1);
  });

  it("patches set part then aliases and missing count on update", async () => {
    const fetchMock = vi
      .fn()
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
          aliases: ["3024b", "3024pr"],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance_line_id: 100,
          part_id: 42,
          catalog_line_id: 10,
          quantity: 5,
          quantity_missing: 2,
        }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <PartLineModal
        mode="edit"
        setCopyId={1}
        line={line}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText(/add alias/i), "3024pr");
    await user.click(within(dialog).getByRole("button", { name: /add alias/i }));
    const missingInput = within(dialog).getByLabelText(/^missing$/i);
    await user.clear(missingInput);
    await user.type(missingInput, "2");
    await user.click(within(dialog).getByRole("button", { name: /^update$/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body,
    }));
    const setPartIdx = calls.findIndex(
      (c) => c.url.includes("/set-parts/100") && c.method === "PATCH",
    );
    const aliasIdx = calls.findIndex(
      (c) => c.url.includes("/parts/42/aliases") && c.method === "PATCH",
    );
    const missingIdx = calls.findIndex(
      (c) => c.url.includes("/inventory-lines/100") && c.method === "PATCH",
    );
    expect(setPartIdx).toBeGreaterThanOrEqual(0);
    expect(aliasIdx).toBeGreaterThan(setPartIdx);
    expect(missingIdx).toBeGreaterThan(aliasIdx);
    expect(calls[aliasIdx]?.body).toBe(
      JSON.stringify({ aliases: ["3024b", "3024pr"] }),
    );
    expect(calls[missingIdx]?.body).toBe(
      JSON.stringify({ quantity_missing: 2 }),
    );
  });

  it("creates set part then patches aliases then uploads image", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test-preview"),
      revokeObjectURL: vi.fn(),
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          instance_line_id: 200,
          part_id: 99,
          catalog_line_id: 20,
          quantity: 1,
          quantity_missing: 0,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          part_id: 99,
          part_num: "3001",
          aliases: ["3001b"],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ image_url: "/api/parts/99/image" }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <PartLineModal
        mode="create"
        setCopyId={1}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/part number/i), "3001");
    await user.type(within(dialog).getByPlaceholderText(/add alias/i), "3001b");
    await user.click(within(dialog).getByRole("button", { name: /add alias/i }));

    const file = new File(["pixels"], "part.png", { type: "image/png" });
    const fileInput = within(dialog).getByLabelText(/^part photo$/i);
    await user.upload(fileInput, file);

    const submitAdd = within(dialog)
      .getByRole("button", { name: /^add$/i });
    await user.click(submitAdd);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method ?? "GET",
    }));
    expect(calls[0]?.url).toContain("/set-parts");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[1]?.url).toContain("/parts/99/aliases");
    expect(calls[1]?.method).toBe("PATCH");
    expect(calls[2]?.url).toContain("/parts/99/image");
    expect(calls[2]?.method).toBe("PUT");
  });
});
