import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";

// Preserve the workspace opener while related dialogs replace one another.
let workspaceOpener: HTMLElement | null = null;

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  footer,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current!;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && !active.closest("dialog"))
      workspaceOpener = active;
    const opener = workspaceOpener;
    node.showModal();
    return () => {
      node.close();
      requestAnimationFrame(() => {
        // A replacement dialog or a caller's explicit focus target takes priority.
        if (document.querySelector("dialog[open]") || !opener?.isConnected) return;
        if (document.activeElement === document.body || !document.activeElement?.isConnected)
          opener.focus({ preventScroll: true });
        if (workspaceOpener === opener) workspaceOpener = null;
      });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`modal ${wide ? "modal-wide" : ""} ${footer ? "modal-with-footer" : ""} ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {footer ? (
        <>
          <div className="modal-scroll-body">{children}</div>
          <footer className="modal-action-footer">{footer}</footer>
        </>
      ) : (
        children
      )}
    </dialog>
  );
}
