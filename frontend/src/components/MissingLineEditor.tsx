import { useState } from "react";

import {
  deleteMissingImage,
  mediaUrl,
  patchMissing,
  uploadMissingImage,
} from "../api/client";
import type { MinifigPartLineDetail, SetPartLineDetail } from "../api/types";

type InventoryLine = SetPartLineDetail | MinifigPartLineDetail;

interface MissingLineEditorProps {
  ownedSetId: number;
  line: InventoryLine;
  lineRef:
    | { kind: "set"; lineId: number }
    | { kind: "minifig"; lineId: number };
  onUpdated: () => void;
}

function patchBody(
  lineRef: MissingLineEditorProps["lineRef"],
  quantity: number,
) {
  if (lineRef.kind === "set") {
    return {
      set_part_inventory_line_id: lineRef.lineId,
      quantity_missing: quantity,
    };
  }
  return {
    minifig_part_inventory_line_id: lineRef.lineId,
    quantity_missing: quantity,
  };
}

export function MissingLineEditor({
  ownedSetId,
  line,
  lineRef,
  onUpdated,
}: MissingLineEditorProps) {
  const [qty, setQty] = useState(String(line.missing_quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState(line.missing_image_url);
  const [missingItemId, setMissingItemId] = useState(line.missing_item_id);

  async function saveQuantity() {
    const parsed = Number.parseInt(qty, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > line.quantity) {
      setError(`Enter 0–${line.quantity}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await patchMissing(
        ownedSetId,
        patchBody(lineRef, parsed),
      );
      if (parsed === 0) {
        setMissingItemId(null);
        setImageUrl(null);
      } else {
        setMissingItemId(result.missing_item_id);
      }
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFileSelected(file: File | undefined) {
    if (!file || missingItemId == null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await uploadMissingImage(ownedSetId, missingItemId, file);
      setImageUrl(result.missing_image_url);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (missingItemId == null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteMissingImage(ownedSetId, missingItemId);
      setImageUrl(null);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const preview = mediaUrl(imageUrl);

  return (
    <div className="missing-editor">
      <label className="missing-editor__qty">
        <span className="sr-only">Missing quantity</span>
        <input
          type="number"
          min={0}
          max={line.quantity}
          value={qty}
          disabled={busy}
          onChange={(e) => setQty(e.target.value)}
          aria-label={`Missing quantity for ${line.part_num}`}
        />
      </label>
      <button
        type="button"
        className="btn btn--small"
        disabled={busy}
        onClick={() => void saveQuantity()}
      >
        Save
      </button>
      {Number.parseInt(qty, 10) > 0 && missingItemId != null && (
        <div className="missing-editor__media">
          <label className="btn btn--small btn--secondary">
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              disabled={busy}
              onChange={(e) => void onFileSelected(e.target.files?.[0])}
            />
          </label>
          {preview && (
            <>
              <a href={preview} target="_blank" rel="noreferrer">
                <img
                  src={preview}
                  alt={`Missing ${line.part_num}`}
                  className="missing-editor__thumb"
                />
              </a>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={busy}
                onClick={() => void removeImage()}
              >
                Remove photo
              </button>
            </>
          )}
        </div>
      )}
      {error && <span className="missing-editor__error">{error}</span>}
    </div>
  );
}
