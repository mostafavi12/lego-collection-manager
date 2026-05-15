import { FormEvent, useState } from "react";

import { addSetPartLine } from "../api/client";
import type { AddSetPartLineBody } from "../api/types";
import { AsyncMessage } from "./AsyncMessage";
import { Modal } from "./Modal";

interface AddPartLineDialogProps {
  ownedSetId: number;
  onClose: () => void;
  onAdded: () => void;
}

export function AddPartLineDialog({
  ownedSetId,
  onClose,
  onAdded,
}: AddPartLineDialogProps) {
  const [partNum, setPartNum] = useState("");
  const [partName, setPartName] = useState("");
  const [colorId, setColorId] = useState("0");
  const [colorName, setColorName] = useState("Black");
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedPart = partNum.trim();
    const parsedQty = Number.parseInt(quantity, 10);
    if (!trimmedPart) {
      setError("Part number is required");
      return;
    }
    if (!Number.isFinite(parsedQty) || parsedQty < 1) {
      setError("Quantity must be at least 1");
      return;
    }

    const body: AddSetPartLineBody = {
      part_num: trimmedPart,
      part_name: partName.trim() || null,
      color_id: Number.parseInt(colorId, 10) || 0,
      color_name: colorName.trim() || null,
      quantity: parsedQty,
    };

    setLoading(true);
    setError(null);
    try {
      await addSetPartLine(ownedSetId, body);
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add part");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Add part" onClose={onClose}>
      <form onSubmit={(e) => void onSubmit(e)}>
        <p>Add a part to this instance&apos;s inventory (shared catalog template).</p>
        <AsyncMessage error={error} />
        <div className="instance-form__grid">
          <label className="form-field">
            Part number
            <input
              value={partNum}
              disabled={loading}
              onChange={(e) => setPartNum(e.target.value)}
              autoFocus
            />
          </label>
          <label className="form-field">
            Part name
            <input
              value={partName}
              disabled={loading}
              onChange={(e) => setPartName(e.target.value)}
            />
          </label>
          <label className="form-field">
            Color ID
            <input
              value={colorId}
              disabled={loading}
              onChange={(e) => setColorId(e.target.value)}
            />
          </label>
          <label className="form-field">
            Color name
            <input
              value={colorName}
              disabled={loading}
              onChange={(e) => setColorName(e.target.value)}
            />
          </label>
          <label className="form-field">
            Quantity
            <input
              type="number"
              min={1}
              value={quantity}
              disabled={loading}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        </div>
        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={loading}
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
