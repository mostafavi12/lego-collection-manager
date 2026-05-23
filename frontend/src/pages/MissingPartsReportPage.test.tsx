import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MissingPartsReportPage } from "./MissingPartsReportPage";

const missingPartsFixture = {
  items: [
    {
      part_id: 10,
      part_num: "3001",
      part_name: "Brick 2x4",
      color_id: 0,
      color_name: "Black",
      quantity_missing_total: 3,
      element_ids: ["300100"],
      part_image_url: null,
      needed_sets: [
        {
          owned_set_id: 1,
          set_num: 6024,
          display_label: "Copy #1",
          quantity_missing: 2,
        },
        {
          owned_set_id: 2,
          set_num: 6024,
          display_label: "Copy #2",
          quantity_missing: 1,
        },
      ],
    },
  ],
  total: 1,
};

describe("MissingPartsReportPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads all incomplete sets when no filter is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => missingPartsFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/reports/missing"]}>
        <MissingPartsReportPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Showing all incomplete sets/i)).toBeInTheDocument();
    expect(screen.getByText("Brick 2x4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/6024 \(Unknown name\) - Copy #1/)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/reports\/missing-parts(?:\?limit=50&offset=0)?$/),
      undefined,
    );
  });

  it("passes owned_set_ids from the query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => missingPartsFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/reports/missing?owned_set_ids=1&owned_set_ids=3"]}>
        <MissingPartsReportPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Showing 2 selected set copies/i)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("owned_set_ids=1"),
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("owned_set_ids=3"),
      undefined,
    );
  });
});
