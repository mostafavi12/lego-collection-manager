/** Resolved URL for part photo display (list + modal), not raw API fields alone. */
export interface PartPhotoDisplayLine {
  part_image_url: string | null;
  image_url: string | null;
  part_image_user_removed?: boolean;
}

export function partPhotoDisplayUrl(line: PartPhotoDisplayLine): string | null {
  if (line.part_image_url) {
    return line.part_image_url;
  }
  if (line.part_image_user_removed) {
    return null;
  }
  return line.image_url;
}
