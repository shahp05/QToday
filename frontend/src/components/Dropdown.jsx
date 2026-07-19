import { useEffect, useRef, useState } from 'react'
import './Dropdown.css'

// Closed single-select dropdown — visually matches Combobox (same list/
// option styling) but click-to-select only, no free-typing and no filtering.
export default function Dropdown({
  value, // selected option's key
  options, // [{key, label, icon?}] — icon (an optional rendered node, e.g. <IconFoo />)
           // only ever shows next to the selected value in the trigger, not
           // in the open option list — keeps the list scannable by name.
  onChange, // (key) => void
  className,
  placeholder = 'Select…',
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const selected = options.find(o => o.key === value)

  function pick(item) {
    onChange(item.key)
    setOpen(false)
  }

  return (
    <div className={`dropdown ${className || ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`dropdown-trigger ${open ? 'dropdown-trigger--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`dropdown-trigger-value ${selected ? '' : 'dropdown-trigger-placeholder'}`}>
          {selected?.icon && <span className="dropdown-option-icon">{selected.icon}</span>}
          {selected ? selected.label : placeholder}
        </span>
        <svg className="dropdown-caret" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="dropdown-list" role="listbox">
          {options.map(item => (
            <li
              key={item.key}
              role="option"
              aria-selected={item.key === value}
              className={`dropdown-option ${item.key === value ? 'dropdown-option--selected' : ''}`}
              onMouseDown={e => { e.preventDefault(); pick(item) }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
