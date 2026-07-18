import katex from 'katex'
import 'katex/dist/katex.min.css'

// The generation prompt asks the LLM for $...$/$$...$$ delimiters, but it
// doesn't always comply — \(...\) and \[...\] show up too — so all four are
// matched here rather than depending on it picking one.
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMath(expr, displayMode) {
  try {
    return katex.renderToString(expr, { throwOnError: false, displayMode })
  } catch {
    return escapeHtml(expr)
  }
}

// Cheap check used to decide whether an edit-mode field is worth showing a
// rendered preview for — no point rendering a preview under plain text.
export function containsMath(text) {
  if (!text) return false
  // A fresh RegExp per call, not MATH_PATTERN.test() with a reset
  // lastIndex — the module-level regex is shared across every call site,
  // and mutating its lastIndex is unsafe if two calls interleave.
  return new RegExp(MATH_PATTERN.source, MATH_PATTERN.flags).test(text)
}

// Renders a string that may contain inline/block LaTeX math, leaving the
// surrounding plain text as-is — used anywhere QA question/answer/option
// text is displayed (not in the editable textareas, which show raw source).
export default function MathText({ text, className }) {
  if (!text) return <span className={className} />

  let html = ''
  let lastIndex = 0
  let match
  // A fresh RegExp per render, not the shared module-level MATH_PATTERN —
  // mutating its lastIndex would be unsafe if two MathText instances (or a
  // containsMath call) matched interleaved during the same render pass.
  const pattern = new RegExp(MATH_PATTERN.source, MATH_PATTERN.flags)
  while ((match = pattern.exec(text)) !== null) {
    const [, block$, blockBracket, inline$, inlineParen] = match
    html += escapeHtml(text.slice(lastIndex, match.index))
    if (block$ !== undefined) html += renderMath(block$, true)
    else if (blockBracket !== undefined) html += renderMath(blockBracket, true)
    else if (inline$ !== undefined) html += renderMath(inline$, false)
    else if (inlineParen !== undefined) html += renderMath(inlineParen, false)
    lastIndex = pattern.lastIndex
  }
  html += escapeHtml(text.slice(lastIndex))

  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
