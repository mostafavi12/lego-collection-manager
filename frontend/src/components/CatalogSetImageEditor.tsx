import {
  deleteCatalogSetImage,
  uploadCatalogSetImage,
} from "../api/client";
import { ImageBlobEditor } from "./ImageBlobEditor";

interface CatalogSetImageEditorProps {
  catalogSetId: number;
  imageUrl: string | null;
  setNum: string | number;
  onUpdated: () => void;
}

export function CatalogSetImageEditor({
  catalogSetId,
  imageUrl,
  setNum,
  onUpdated,
}: CatalogSetImageEditorProps) {
  return (
    <ImageBlobEditor
      className="catalog-set-image-editor"
      imageUrl={imageUrl}
      alt={`Set ${setNum}`}
      uploadLabel="Set photo"
      onUpload={(file) => uploadCatalogSetImage(catalogSetId, file)}
      onDelete={() => deleteCatalogSetImage(catalogSetId)}
      onUpdated={onUpdated}
    />
  );
}
