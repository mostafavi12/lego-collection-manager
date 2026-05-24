import type {
  GroupBy,
  SetSortBy,
  SortDir,
} from "../utils/setCopyListProcessing";

const STORAGE_KEY = "lcm.setsListPreferences";

const SORT_BY_VALUES: SetSortBy[] = [
  "created",
  "set_num",
  "name",
  "theme",
  "num_parts",
  "age",
];
const SORT_DIR_VALUES: SortDir[] = ["asc", "desc"];
const GROUP_BY_VALUES: GroupBy[] = ["theme", "age"];

export const DEFAULT_SETS_LIST_SORT_BY: SetSortBy = "set_num";
export const DEFAULT_SETS_LIST_SORT_DIR: SortDir = "asc";
export const DEFAULT_SETS_LIST_GROUP_BY: GroupBy[] = ["theme"];

export type SetsListPreferences = {
  sortBy: SetSortBy;
  sortDir: SortDir;
  groupBy: GroupBy[];
};

function defaultPreferences(): SetsListPreferences {
  return {
    sortBy: DEFAULT_SETS_LIST_SORT_BY,
    sortDir: DEFAULT_SETS_LIST_SORT_DIR,
    groupBy: [...DEFAULT_SETS_LIST_GROUP_BY],
  };
}

function parseGroupBy(value: unknown): GroupBy[] {
  if (!Array.isArray(value)) {
    return defaultPreferences().groupBy;
  }
  const seen = new Set<GroupBy>();
  const groupBy: GroupBy[] = [];
  for (const entry of value) {
    if (
      typeof entry === "string" &&
      GROUP_BY_VALUES.includes(entry as GroupBy) &&
      !seen.has(entry as GroupBy)
    ) {
      const group = entry as GroupBy;
      seen.add(group);
      groupBy.push(group);
    }
  }
  return groupBy;
}

export function readStoredSetsListPreferences(): SetsListPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultPreferences();
    }
    const parsed = JSON.parse(raw) as Partial<SetsListPreferences>;
    const sortBy = SORT_BY_VALUES.includes(parsed.sortBy as SetSortBy)
      ? (parsed.sortBy as SetSortBy)
      : DEFAULT_SETS_LIST_SORT_BY;
    const sortDir = SORT_DIR_VALUES.includes(parsed.sortDir as SortDir)
      ? (parsed.sortDir as SortDir)
      : DEFAULT_SETS_LIST_SORT_DIR;
    return {
      sortBy,
      sortDir,
      groupBy: parseGroupBy(parsed.groupBy),
    };
  } catch {
    return defaultPreferences();
  }
}

export function writeStoredSetsListPreferences(
  preferences: SetsListPreferences,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // ignore private browsing / unavailable storage
  }
}
