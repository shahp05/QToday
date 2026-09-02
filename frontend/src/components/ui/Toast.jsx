import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './Toast.css'

// Every Toast instance — however many different components render one at
// once (Dashboard's persistent nudge, a page's own error Toast, etc.) —
// portals into this single shared, lazily-created container instead of
// each positioning itself fixed independently, so simultaneous toasts
// stack instead of overlapping at the same bottom-right corner.
function getToastStackRoot() {
  let root = document.getElementById('ui-toast-stack')
  if (!root) {
    root = document.createElement('div')
    root.id = 'ui-toast-stack'
    root.className = 'ui-toast-stack'
    document.body.appendChild(root)
  }
  return root
}

// duration is null by default — the toast stays up until the user dismisses
// it via the close button (or a caller-driven retry/navigation clears the
// message prop itself). Pass an explicit ms value to opt a specific toast
// back into auto-dismissing.
//
// onClick is optional — when passed, the message itself becomes a button
// (its own element, a sibling of the close button rather than a wrapper
// around it, so a close click never also bubbles into onClick) that both
// fires the callback and dismisses the toast, for an actionable prompt
// like "your password is still the default — click to change it" rather
// than a passive status message.
export function Toast({ message, onDismiss, duration = null, variant = 'error', onClick }) {
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

  function handleMessageClick() {
    onClick()
    dismiss()
  }

  return createPortal(
    <div className={`ui-toast ui-toast--${variant}${visible ? ' ui-toast--show' : ''}`} role="alert">
      {onClick ? (
        <button className="ui-toast__msg ui-toast__msg--clickable" onClick={handleMessageClick}>{message}</button>
      ) : (
        <span className="ui-toast__msg">{message}</span>
      )}
      <button className="ui-toast__close" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>,
    getToastStackRoot()
  )
}
