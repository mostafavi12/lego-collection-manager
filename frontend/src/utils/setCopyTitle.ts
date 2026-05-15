/**
 * Primary display title for a set copy (home list + detail header):
 * `{set_num} ({catalog name}) - {copy label}`.
 * Example: `65001-1 (Police Station) - Copy #2`
 */
export function formatSetCopyTitle(
  setNum: string,
  catalogName: string | null | undefined,
  copyDisplayLabel: string,
): string {
  const displayName = catalogName?.trim() || "Unknown name";
  return `${setNum} (${displayName}) - ${copyDisplayLabel}`;
}
