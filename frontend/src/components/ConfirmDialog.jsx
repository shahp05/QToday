import './ConfirmDialog.css'

// Same spinner shape as TeachLogList.jsx's IconSpinner — kept local rather
// than shared since it's a one-line svg and the two components are otherwise
// unrelated.
function IconSpinner() {
  return (
    <svg className="confirm-dialog-spinner" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// Generic modal confirm/cancel dialog — no dialog primitive exists elsewhere
// in the app yet, so this is the first and is written to be reusable beyond
// its first caller (StartSessionDialog). While busy, a centered overlay
// covers the whole dialog (buttons included) instead of swapping button
// text — blocks repeat clicks on Start/Cancel without the label changing.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  confirmBusy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null

  return (
    <div className="confirm-dialog-overlay" onMouseDown={onCancel}>
      <div className="confirm-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        {title && <h2 className="confirm-dialog-title">{title}</h2>}
        <div className="confirm-dialog-body">{children}</div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-dialog-cancel-btn" onClick={onCancel} disabled={confirmBusy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog-confirm-btn"
            onClick={onConfirm}
            disabled={confirmDisabled || confirmBusy}
          >
            {confirmLabel}
          </button>
        </div>

        {confirmBusy && (
          <div className="confirm-dialog-busy-overlay" role="status" aria-label="Working">
            <IconSpinner />
          </div>
        )}
      </div>
    </div>
  )
}
