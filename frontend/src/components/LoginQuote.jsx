import { useEffect, useState } from 'react'
import './LoginQuote.css'

function IconQuote() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.17 6C4.87 6 3 7.87 3 10.17c0 2.09 1.53 3.83 3.53 4.13-.36 1.35-1.31 2.5-2.53 3.2l1 1.5c2.4-1.24 4-3.9 4-6.83V10.17C9 7.87 7.13 6 7.17 6zm10 0C14.87 6 13 7.87 13 10.17c0 2.09 1.53 3.83 3.53 4.13-.36 1.35-1.31 2.5-2.53 3.2l1 1.5c2.4-1.24 4-3.9 4-6.83V10.17C19 7.87 17.13 6 17.17 6z"/>
    </svg>
  )
}

export default function LoginQuote() {
  const [quote, setQuote] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/quotes.json')
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const list = data?.quotes ?? []
        if (list.length) {
          setQuote(list[Math.floor(Math.random() * list.length)])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="loginquote">
      {quote && (
        <>
          <IconQuote />
          <p className="loginquote-message">{quote.message}</p>
          <p className="loginquote-author">{quote.author}</p>
        </>
      )}
    </div>
  )
}
