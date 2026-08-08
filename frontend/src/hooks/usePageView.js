import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

// Keeps ?view=<name> in the URL as the single source of truth for which
// named sub-screen of a page-header page is showing (e.g. Subjects' list
// vs log, a student's topics vs progress) — every page with a PageHeader
// uses this, so switching is always a real, back-able history entry, and
// the current screen is always explicitly named in the URL rather than
// implied by the param's absence. That "absence = default" shortcut is
// what broke toggling back to the default screen: setting the default by
// deleting an already-absent param is a no-op, so the toggle looked dead.
//
// setView always writes an explicit value (push — a real step). The
// default is reflected into the URL on first mount via a replace, so it
// never actually stays absent, without adding an extra back-step for it —
// the page becoming visible and the URL naming its view are one navigation.
export function usePageView(defaultView) {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') ?? defaultView

  useEffect(() => {
    if (searchParams.has('view')) return
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.set('view', defaultView)
      return params
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setView(next) {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      params.set('view', next)
      return params
    })
  }

  return [view, setView]
}
