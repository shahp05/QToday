import { useEffect, useState } from 'react'
import './Toast.css'

export function Toast({ message, onDismiss, duration = 5000, variant = 'error' }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    // Allow DOM to paint before triggering transition
    const enter = requestAnimationFrame(() => setVisible(true))
    const exit  = setTimeout(() => {
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
