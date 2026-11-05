import { useEffect, useRef } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A modal yes/no question. Escape and the backdrop cancel; focus starts on the safe choice. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="backdrop" onPointerDown={onCancel}>
      <div className="dialog island" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message" onPointerDown={(e) => e.stopPropagation()}>
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn-text" data-testid="dialog-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-text danger" data-testid="dialog-confirm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
