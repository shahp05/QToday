import { useEffect, useState } from 'react'
import './Toast.css'

// duration is null by default — the toast stays up until the user dismisses
// it via the close button (or a caller-driven retry/navigation clears the
// message prop itself). Pass an explicit ms value to opt a specific toast
// back into auto-dismissing.
export function Toast({ message, onDismiss, duration = null, variant = 'error' }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    // Allow DOM to paint before triggering transition
    const enter = requestAnimationFrame(() => setVisible(true))
    if (!duration) return () => cancelAnimationFrame(enter)
    const exit = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 280)
    }, duration)
    return () => {
      cancelAnimationFrame(enter)
      clearTimeout(exit)
    }
  }, [message, duration, onDismiss])

  if (!message) return null

  function dismiss() {
    setVisible(false)
    setTimeout(onDismiss, 280)
  }

  return (
    <div className={`ui-toast ui-toast--${variant}${visible ? ' ui-toast--show' : ''}`} role="alert">
      <span className="ui-toast__msg">{message}</span>
      <button className="ui-toast__close" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  )
}
