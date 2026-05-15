import { FormEvent, useEffect, useState } from "react";

import {
  addSetPartLine,
  deletePartImage,
  deleteSetPartLine,
  updateSetPartLine,
  uploadPartImage,
} from "../api/client";
import type { SetPartLineDetail } from "../api/types";
import { AsyncMessage } from "./AsyncMessage";
import { ImageBlobEditor } from "./ImageBlobEditor";
import { Modal } from "./Modal";

interface PartLineModalProps {
  mode: "create" | "edit";
  ownedSetId: number;
  line?: SetPartLineDetail;
  onClose: () => void;
  onSaved: () => void;
}

export function PartLineModal({
  mode,
  ownedSetId,
  line,
  onClose,
  onSaved,
}: PartLineModalProps) {
  const isEdit = mode === "edit" && line !== undefined;

  const [partNum, setPartNum] = useState(line?.part_num ?? "");
  const [partName, setPartName] = useState(line?.part_name ?? "");
  const [colorId, setColorId] = useState(
    line != null ? String(line.color_id) : "0",
  );
  const [colorName, setColorName] = useState(line?.color_name ?? "Black");
  const [quantity, setQuantity] = useState(
    line != null ? String(line.quantity) : "1",
  );
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (pendingImage == null) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  function onPendingFileSelected(file: File | undefined) {
    setPendingImage(file ?? null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedQty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(parsedQty) || parsedQty < 1) {
      setError("Quantity must be at least 1");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit && line) {
        await updateSetPartLine(ownedSetId, line.instance_line_id, {
          part_name: partName.trim() || null,
          color_id: Number.parseInt(colorId, 10) || 0,
          color_name: colorName.trim() || null,
          quantity: parsedQty,
        });
      } else {
        const trimmedPart = partNum.trim();
        if (!trimmedPart) {
          setError("Part number is required");
          setLoading(false);
          return;
        }
        const created = await addSetPartLine(ownedSetId, {
          part_num: trimmedPart,
          part_name: partName.trim() || null,
          color_id: Number.parseInt(colorId, 10) || 0,
          color_name: colorName.trim() || null,
          quantity: parsedQty,
        });
        if (pendingImage) {
          try {
            await uploadPartImage(created.part_id, pendingImage);
          } catch (uploadErr) {
            setError(
              uploadErr instanceof Error
                ? `${uploadErr.message} (part was added; retry image from edit)`
                : "Image upload failed (part was added)",
            );
            onSaved();
            return;
          }
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save part");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!line) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await deleteSetPartLine(ownedSetId, line.instance_line_id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete part");
    } finally {
      setLoading(false);
      setConfirmDelete(false);
    }
  }

  const title = isEdit ? "Edit part" : "Add part";
  const imageUrl = line?.part_image_url ?? line?.image_url ?? null;

  return (
    <Modal title={title} onClose={onClose}>
      {confirmDelete && line ? (
        <>
          <p>
            Remove <strong>{line.part_num}</strong> ({line.color_name}) from
            this instance&apos;s inventory?
          </p>
          <AsyncMessage error={error} />
          <div className="modal__actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loading}
              onClick={() => setConfirmDelete(false)}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={loading}
              onClick={() => void onDelete()}
            >
              {loading ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)}>
          <p>
            {isEdit
              ? "Update catalog part details and this copy's quantity."
              : "Add a part to this instance's inventory (shared catalog template)."}
          </p>
          <AsyncMessage error={error} />
          <div className="instance-form__grid">
            <label className="form-field">
              Part number
              <input
                value={partNum}
                disabled={loading || isEdit}
                readOnly={isEdit}
                onChange={(e) => setPartNum(e.target.value)}
                autoFocus={!isEdit}
              />
            </label>
            <label className="form-field">
              Part name
              <input
                value={partName}
                disabled={loading}
                onChange={(e) => setPartName(e.target.value)}
                autoFocus={isEdit}
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

          <div className="part-line-modal__image">
            <p className="form-hint">Part image (shared across all sets)</p>
            {isEdit && line ? (
              <ImageBlobEditor
                imageUrl={imageUrl}
                alt={`Part ${line.part_num}`}
                uploadLabel="Part photo"
                onUpload={(file) => uploadPartImage(line.part_id, file)}
                onDelete={() => deletePartImage(line.part_id)}
                onUpdated={onSaved}
              />
            ) : (
              <div className="image-blob-editor">
                {pendingPreview ? (
                  <img
                    src={pendingPreview}
                    alt="Selected part"
                    className="image-blob-editor__preview"
                  />
                ) : (
                  <div className="image-blob-editor__placeholder" aria-hidden />
                )}
                <label className="btn btn--small btn--secondary">
                  Part photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    disabled={loading}
                    onChange={(e) =>
                      onPendingFileSelected(e.target.files?.[0])
                    }
                  />
                </label>
              </div>
            )}
          </div>

          <div className="modal__actions">
            {isEdit ? (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={loading}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={loading}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading}
                >
                  {loading ? "Saving…" : "Update"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={loading}
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading}
                >
                  {loading ? "Adding…" : "Add"}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}