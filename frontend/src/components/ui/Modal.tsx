import React from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose?: () => void;
  size?: "sm" | "md" | "lg";
  top?: boolean;
  dim?: boolean;
  children: React.ReactNode;
  showClose?: boolean;
};

export function Modal({
  open,
  onClose,
  size = "md",
  top = false,
  dim = false,
  showClose = true,
  children,
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const overlayClass = ["modal-overlay", top ? "top" : "", dim ? "dim" : ""]
    .filter(Boolean)
    .join(" ");
  const modalClass = ["modal", size === "sm" ? "sm" : size === "lg" ? "lg" : ""]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className={overlayClass} onClick={() => onClose?.()} role="dialog" aria-modal="true">
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        {showClose && onClose && (
          <button aria-label="Close" className="modal-close" onClick={onClose}>
            ×
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="modal-body">{children}</div>;
}

export function ModalActions({
  children,
  vertical,
}: {
  children: React.ReactNode;
  vertical?: boolean;
}) {
  return <div className={vertical ? "modal-actions vertical" : "modal-actions"}>{children}</div>;
}
