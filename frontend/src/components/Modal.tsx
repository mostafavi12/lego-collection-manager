import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
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
