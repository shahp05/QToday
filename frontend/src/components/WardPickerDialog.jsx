import './ConfirmDialog.css'
import './WardPickerDialog.css'

// A parent with multiple wards (children) picks which one's data the app is
// scoped to — reuses ConfirmDialog's overlay/panel look (see ConfirmDialog.jsx)
// but the body is a list of selectable wards instead of confirm/cancel actions,
// since picking a ward IS the action (closes itself on selection).
export default function WardPickerDialog({ open, wards, selectedWardId, onSelect, onClose }) {
  if (!open) return null

  return (
    <div className="confirm-dialog-overlay" onMouseDown={onClose}>
      <div className="confirm-dialog ward-picker-dialog" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="confirm-dialog-title">Select child</h2>
        <div className="ward-picker-list">
          {wards.map(ward => (
            <button
              key={ward.student_id}
              type="button"
              className={`ward-picker-item ${ward.student_id === selectedWardId ? 'ward-picker-item--active' : ''}`}
              onClick={() => { onSelect(ward.student_id); onClose() }}
            >
              {ward.photo_url ? (
                <img src={ward.photo_url} alt="" className="ward-picker-item-photo" />
              ) : (
                <span className="ward-picker-item-photo ward-picker-item-photo--placeholder">{ward.name?.[0] ?? '?'}</span>
              )}
              <span className="ward-picker-item-name">{ward.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
