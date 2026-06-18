import { useState, useCallback, useRef } from 'react'

/**
 * rules: { fieldKey: { label: string, required?: bool, validate?: (val, allValues) => string|null } }
 *
 * Returns:
 *   errors     — { fieldKey: errorMessage }
 *   validate   — (values) => bool  (false = has errors, also triggers shake)
 *   clearError — (fieldKey) => void  (call on input change)
 *   clearAll   — () => void
 *   isShaking  — bool (true for ~450ms after a failed validate, per-field)
 *   hasErrors  — bool
 */
export function useValidation(rules) {
  const [errors, setErrors]     = useState({})
  const [isShaking, setShaking] = useState(false)
  const shakeTimer              = useRef(null)

  const validate = useCallback((values) => {
    const next = {}
    for (const [key, rule] of Object.entries(rules)) {
      const raw = values[key]
      const val = typeof raw === 'string' ? raw.trim() : raw
      if (rule.required && !val) {
        next[key] = 'Required'
      } else if (rule.validate) {
        const msg = rule.validate(raw, values)
        if (msg) next[key] = msg
      }
    }
    setErrors(next)
    if (Object.keys(next).length > 0) {
      clearTimeout(shakeTimer.current)
      setShaking(true)
      shakeTimer.current = setTimeout(() => setShaking(false), 450)
      return false
    }
    return true
  }, [rules])

  const clearError = useCallback((key) => {
    setErrors(prev => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearAll = useCallback(() => setErrors({}), [])

  return {
    errors,
    validate,
    clearError,
    clearAll,
    isShaking,
    hasErrors: Object.keys(errors).length > 0,
  }
}
