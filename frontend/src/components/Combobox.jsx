import { useEffect, useRef, useState } from 'react'
import './Combobox.css'

// Non-destructive autocomplete: a plain text input the caller can always
// type freely into (nothing here ever overwrites what they're typing),
// with a live substring-filtered suggestion list layered on top. Picking a
// suggestion — click, or Enter/Tab while one is keyboard-highlighted —
// fills the input via onPick; every other interaction behaves exactly like
// a normal <input>, so this is an add-on to existing forms, not a
// replacement widget.
export default function Combobox({
  value,
  onChange,
  onPick,
  options, // [{key, label}]
  inputRef,
  className,
  placeholder,
  onBlur,
  onKeyDown,
  maxSuggestions = 6,
  ...inputProps
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const wrapRef = useRef(null)
  const localRef = useRef(null)
  const ref = inputRef || localRef

  const query = value.trim().toLowerCase()
  const matches = query
    ? options.filter(o => o.label.toLowerCase().includes(query)).slice(0, maxSuggestions)
    : []

  useEffect(() => {
    setHighlighted(-1)
  }, [value])

  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function pick(item) {
    onPick(item)
    setOpen(false)
    setHighlighted(-1)
  }

  function handleKeyDown(e) {
    if (open && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted(h => (h + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted(h => (h <= 0 ? matches.length - 1 : h - 1))
        return
      }
      if (e.key === 'Enter' && highlighted >= 0) {
        e.preventDefault()
        pick(matches[highlighted])
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        {...inputProps}
        ref={ref}
        className={className}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="combobox-list" role="listbox">
          {matches.map((item, i) => (
            <li
              key={item.key}
              role="option"
              aria-selected={i === highlighted}
              className={`combobox-option ${i === highlighted ? 'combobox-option--highlighted' : ''}`}
              // mousedown (not click) + preventDefault so the input doesn't
              // blur — and close the dropdown — before the pick registers.
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
