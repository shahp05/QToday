import { useEffect, useRef, useState } from 'react'
import './Combobox.css'

// Autocomplete: a plain text input the caller can always type freely into,
// with a live substring-filtered suggestion list layered on top. Picking a
// suggestion — click, Enter while one is keyboard-highlighted, or blurring
// with exactly one unambiguous match — fills the input via onPick; every
// other interaction (including blurring with zero or multiple matches,
// which leaves the typed text untouched) behaves exactly like a normal
// <input>, so this is an add-on to existing forms, not a replacement
// widget.
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
  // Once what's typed exactly matches an option, there's nothing left to
  // suggest — collapse the list on its own rather than waiting for a blur
  // that may never come (e.g. the next action is clicking a button, not
  // moving to another field), which would otherwise leave the list
  // covering the rest of the page indefinitely.
  const isExactMatch = matches.length === 1 && matches[0].label.toLowerCase() === query

  // Reset the keyboard highlight whenever the typed value changes — done
  // directly during render (not in an effect), per React's documented
  // pattern for adjusting state in response to a prop/state change.
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    setPrevValue(value)
    setHighlighted(-1)
  }

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
    if (open && matches.length > 0 && !isExactMatch) {
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
        onBlur={e => {
          // Auto-commit an unambiguous single match on blur — standard
          // combobox behavior — rather than leaving the field on typed
          // text that's one keystroke short of a known option. Multiple
          // matches are ambiguous (no single right answer to silently
          // pick), and no matches means there's nothing to commit, so
          // both just close the dropdown and leave the typed text as-is.
          // Picking a suggestion via mouse (onMouseDown + preventDefault,
          // below) never triggers this blur, so it's always safe to run.
          if (matches.length === 1) pick(matches[0])
          else setOpen(false)
          onBlur?.(e)
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && matches.length > 0 && !isExactMatch && (
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
