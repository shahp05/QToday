import { useEffect, useState } from 'react'
import './LoginQuote.css'

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
          <p className="loginquote-message">{quote.message}</p>
          <p className="loginquote-author">{quote.author}</p>
        </>
      )}
    </div>
  )
}
