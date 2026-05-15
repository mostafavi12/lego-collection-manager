import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Extra class(es) merged onto the `.modal` dialog (e.g. `modal--wide`). */
  modalClassName?: string;
}

export function Modal({ title, children, onClose, modalClassName }: ModalProps) {
  const dialogCls = modalClassName
    ? `modal ${modalClassName}`
    : "modal";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={dialogCls}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button
            type="button"
            className="btn btn--ghost modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
