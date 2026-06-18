import './FieldError.css'

export function FieldError({ message }) {
  return (
    <div className={`ui-field-error${message ? ' ui-field-error--show' : ''}`} aria-live="polite">
      {message}
    </div>
  )
}
