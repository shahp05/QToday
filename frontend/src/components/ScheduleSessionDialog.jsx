import { useState } from 'react'
import { useSessionsStore } from '../store/sessionsStore'
import ConfirmDialog from './ConfirmDialog'
import DatePicker from './DatePicker'
import { formatDate } from '../lib/dateFormat'
import { Toast } from './ui/Toast'
import './ScheduleSessionDialog.css'

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export default function ScheduleSessionDialog({ open, onClose, onScheduled }) {
  const [date, setDate] = useState(today)
  const futureSession = useSessionsStore(s => s.futureSession)
  const scheduling = useSessionsStore(s => s.scheduling)
  const scheduleError = useSessionsStore(s => s.scheduleError)
  const clearScheduleError = useSessionsStore(s => s.clearScheduleError)
  const scheduleSession = useSessionsStore(s => s.scheduleSession)

  // Re-default every time the dialog opens (it stays mounted, ConfirmDialog
  // just renders null while closed) — pre-fill from the already-scheduled
  // future date if one exists (so reopening edits it), else today. A state
  // adjustment during render (React's documented pattern for this), not a
  // sync with an external system, so no effect is needed.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDate(futureSession ? new Date(`${futureSession.start_date}T00:00:00`) : today())
    }
  }

  function handleClose() {
    if (scheduling) return
    clearScheduleError()
    onClose()
  }

  async function handleConfirm() {
    const ok = await scheduleSession(date)
    if (ok) {
      onScheduled?.()
      onClose()
    }
  }

  return (
    <>
      <ConfirmDialog
        open={open}
        title="Schedule Next Session"
        confirmLabel={`Start ${formatDate(date)}`}
        confirmBusy={scheduling}
        onConfirm={handleConfirm}
        onCancel={handleClose}
      >
        <p className="schedule-session-warning">
          Today's calendar log stays live and unaffected until this date.
          You can pre-stage next session's student roster ahead of time via
          upload — the switch happens automatically on the date below, or
          right away if you pick today.
        </p>
        <span className="schedule-session-label">Next session start date</span>
        <DatePicker value={date} onChange={setDate} min={today()} />
      </ConfirmDialog>
      <Toast message={scheduleError} onDismiss={clearScheduleError} />
    </>
  )
}
