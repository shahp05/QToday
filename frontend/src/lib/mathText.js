// The generation prompt asks the LLM for $...$/$$...$$ delimiters, but it
// doesn't always comply — \(...\) and \[...\] show up too — so all four are
// matched here rather than depending on it picking one.
export const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$\n]+?)\$|\\\(([\s\S]+?)\\\)/g

export function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
