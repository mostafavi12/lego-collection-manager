import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetsListPage } from "./SetsListPage";
import { setCopyListFixture } from "../test/fixtures";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SetsListPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("SetsListPage", () => {
  afterEach(() => {
    cleanup();
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

    expect(await screen.findByText(/6024 \(Police Car\) - copy A/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /make a copy/i })).toHaveLength(2);
    expect(screen.queryByText(/sync:/i)).not.toBeInTheDocument();
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
          set_num: 6024,
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

  it("passes sort/theme filters and can group by theme and age", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => setCopyListFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/6024 \(Police Car\) - copy A/);

    await user.selectOptions(screen.getByLabelText(/sort by/i), "theme");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("sort_by=theme"),
        undefined,
      );
    });

    await user.selectOptions(screen.getByLabelText(/^theme$/i), "Town");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("theme=Town"),
        undefined,
      );
    });

    await user.click(screen.getByLabelText(/group by theme and age/i));
    expect(screen.getByRole("heading", { name: "Town" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Age unknown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Age 8" })).toBeInTheDocument();
  });

  it("shows direct page navigation when there are more than two pages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...setCopyListFixture, total: 65 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderPage(["/?page=2"]);

    await screen.findByText(/6024 \(Police Car\) - copy A/);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("offset=20"),
        undefined,
      );
    });
    expect(screen.getByText(/page 2 of 4/i)).toBeInTheDocument();

    const pageInput = screen.getByLabelText(/page number/i);
    await user.clear(pageInput);
    await user.type(pageInput, "99");
    await user.click(screen.getByRole("button", { name: /go to page #/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("offset=60"),
        undefined,
      );
    });

    await user.clear(pageInput);
    await user.type(pageInput, "0");
    await user.click(screen.getByRole("button", { name: /go to page #/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("offset=0"),
        undefined,
      );
    });
  });

  it("keeps the current page in the collection URL before opening a set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...setCopyListFixture, total: 65 }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/6024 \(Police Car\) - copy A/);
    await user.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining("offset=20"),
        undefined,
      );
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/?page=2");
    expect(screen.getByRole("link", { name: /6024 \(Police Car\) - copy A/i })).toHaveAttribute(
      "href",
      "/sets/1",
    );
  });
});
