import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETS_LIST_GROUP_BY,
  DEFAULT_SETS_LIST_SORT_BY,
  readStoredSetsListPreferences,
  writeStoredSetsListPreferences,
} from "./setsListPreferencesStorage";

describe("setsListPreferencesStorage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("returns theme grouping and set number sort by default", () => {
    expect(readStoredSetsListPreferences()).toEqual({
      sortBy: "set_num",
      sortDir: "asc",
      groupBy: ["theme"],
    });
  });

  it("reads and writes valid stored preferences", () => {
    writeStoredSetsListPreferences({
      sortBy: "name",
      sortDir: "desc",
      groupBy: ["age", "theme"],
    });
    expect(readStoredSetsListPreferences()).toEqual({
      sortBy: "name",
      sortDir: "desc",
      groupBy: ["age", "theme"],
    });
  });

  it("falls back to defaults for invalid stored values", () => {
    localStorage.setItem(
      "lcm.setsListPreferences",
      JSON.stringify({
        sortBy: "invalid",
        sortDir: "sideways",
        groupBy: ["color", "theme"],
      }),
    );
    expect(readStoredSetsListPreferences()).toEqual({
      sortBy: DEFAULT_SETS_LIST_SORT_BY,
      sortDir: "asc",
      groupBy: ["theme"],
    });
    expect(DEFAULT_SETS_LIST_GROUP_BY).toEqual(["theme"]);
  });
});
