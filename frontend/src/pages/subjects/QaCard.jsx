import { useState } from 'react'
import { updateQA } from '../../services/qaService'
import MathText from '../../components/MathText'
import { containsMath } from '../../lib/mathText'
import './QaCard.css'

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconSpinner() {
  return <span className="qa-card-spinner" role="status" aria-label="Working" />
}

// MCQ items already carry an options object; true/false items don't, so
// synthesize one here to render both the same way (two boxed rows, correct
// one highlighted) instead of a plain "Answer: True/False" line.
function getRenderOptions(qa) {
  if (qa.options) return qa.options
  if (qa.question_type === 'true_false') return { T: 'True', F: 'False' }
  return null
}

function correctKeysFor(qa, renderOptions, isMcq) {
  if (!renderOptions) return []
  return Object.keys(renderOptions).filter(key =>
    isMcq
      ? qa.answer.toLowerCase().split(',').includes(key.toLowerCase())
      : qa.answer.toLowerCase() === renderOptions[key].toLowerCase()
  )
}

const FLAG_REASONS = [
  { value: 'unclear', label: 'Unclear' },
  { value: 'incorrect', label: 'Incorrect' },
  { value: 'irrelevant', label: 'Irrelevant' },
]

// Teacher-facing review card for one QA item: view mode shows the question,
// options/answer, and difficulty; edit mode turns the question/answer/option
// text into editable fields (with a Save/Cancel pair), and a separate flag
// menu lets a teacher pull the item out of circulation instead of fixing it.
export default function QaCard({ qa, onUpdated, onFlagged }) {
  const [editing, setEditing] = useState(false)
  const [flagMenuOpen, setFlagMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [flaggingReason, setFlaggingReason] = useState(null)
  const [saveError, setSaveError] = useState('')
  const renderOptions = getRenderOptions(qa)
  const isMcq = !!qa.options

  const [draftQuestion, setDraftQuestion] = useState(qa.question)
  const [draftOptions, setDraftOptions] = useState(qa.options || {})
  const [draftAnswer, setDraftAnswer] = useState(qa.answer)
  const [draftCorrectKeys, setDraftCorrectKeys] = useState(correctKeysFor(qa, renderOptions, isMcq))

  function startEdit() {
    setDraftQuestion(qa.question)
    setDraftOptions(qa.options || {})
    setDraftAnswer(qa.answer)
    setDraftCorrectKeys(correctKeysFor(qa, renderOptions, isMcq))
    setSaveError('')
    setEditing(true)
  }

  function toggleCorrect(key) {
    // Both MCQ and true/false are single-select (radio behavior) — the
    // generation prompt now guarantees exactly one correct MCQ answer.
    setDraftCorrectKeys([key])
  }

  async function handleSave() {
    let payload
    if (isMcq) {
      payload = {
        question: draftQuestion,
        options: draftOptions,
        answer: draftCorrectKeys.map(k => k.toLowerCase()).join(','),
      }
    } else if (renderOptions) {
      payload = {
        question: draftQuestion,
        answer: draftCorrectKeys[0] === 'T' ? 'True' : 'False',
      }
    } else {
      payload = { question: draftQuestion, answer: draftAnswer }
    }

    // Nothing actually changed — skip the request/db write entirely rather
    // than round-tripping a no-op edit (which would also needlessly flip
    // is_verified on an already-verified row).
    const unchanged =
      payload.question === qa.question &&
      payload.answer.toLowerCase() === qa.answer.toLowerCase() &&
      (!payload.options || JSON.stringify(payload.options) === JSON.stringify(qa.options))
    if (unchanged) {
      setEditing(false)
      return
    }

    setSaving(true)
    setSaveError('')
    try {
      const updated = await updateQA(qa.qa_id, payload)
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleFlag(reason) {
    setFlaggingReason(reason)
    setSaveError('')
    try {
      await updateQA(qa.qa_id, { flag_reason: reason })
      onFlagged(qa.qa_id)
    } catch (err) {
      setSaveError(err.message)
      setFlaggingReason(null)
      setFlagMenuOpen(false)
    }
  }

  return (
    <div className="qa-card">
      <div className="qa-card-question-row">
        {editing ? (
          <div className="qa-card-edit-field">
            <textarea
              className="qa-card-edit-question"
              value={draftQuestion}
              onChange={e => setDraftQuestion(e.target.value)}
            />
            {containsMath(draftQuestion) && (
              <div className="qa-card-preview">
                <span className="qa-card-preview-label">Preview</span>
                <MathText text={draftQuestion} />
              </div>
            )}
          </div>
        ) : (
          <MathText className="qa-card-question" text={qa.question} />
        )}
      </div>

      {!editing && renderOptions && (
        <ul className="qa-card-options">
          {Object.entries(renderOptions).map(([key, text]) => {
            const isCorrect = isMcq
              ? qa.answer.toLowerCase().split(',').includes(key.toLowerCase())
              : qa.answer.toLowerCase() === text.toLowerCase()
            return (
              <li key={key}>
                <span className={`qa-card-option-label${isCorrect ? ' qa-card-option-label--correct' : ''}`}>
                  {key.toUpperCase()}
                </span>
                <MathText text={text} />
              </li>
            )
          })}
        </ul>
      )}
      {!editing && !renderOptions && (
        <p className="qa-card-answer">Answer: <MathText text={qa.answer} /></p>
      )}

      {editing && renderOptions && (
        <ul className="qa-card-options">
          {Object.entries(renderOptions).map(([key, text]) => {
            const isCorrect = draftCorrectKeys.includes(key)
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`qa-card-option-label${isCorrect ? ' qa-card-option-label--correct' : ''}`}
                  onClick={() => toggleCorrect(key)}
                  aria-label={`Mark ${key.toUpperCase()} as correct`}
                >
                  {key.toUpperCase()}
                </button>
                {isMcq ? (
                  <div className="qa-card-edit-field qa-card-edit-field--option">
                    <input
                      type="text"
                      className="qa-card-edit-option"
                      value={draftOptions[key] ?? text}
                      onChange={e => setDraftOptions(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                    {containsMath(draftOptions[key] ?? text) && (
                      <div className="qa-card-preview">
                        <span className="qa-card-preview-label">Preview</span>
                        <MathText text={draftOptions[key] ?? text} />
                      </div>
                    )}
                  </div>
                ) : (
                  <span>{text}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {editing && !renderOptions && (
        <div className="qa-card-edit-field">
          <textarea
            className="qa-card-edit-answer"
            value={draftAnswer}
            onChange={e => setDraftAnswer(e.target.value)}
          />
          {containsMath(draftAnswer) && (
            <div className="qa-card-preview">
              <span className="qa-card-preview-label">Preview</span>
              <MathText text={draftAnswer} />
            </div>
          )}
        </div>
      )}

      <div className="qa-card-actions-row">
        {editing ? (
          <>
            <button className="qa-card-pill qa-card-pill--save" onClick={handleSave} disabled={saving}>
              <span style={{ visibility: saving ? 'hidden' : 'visible' }}>Save</span>
              {saving && (
                <span className="qa-card-pill-spinner-overlay">
                  <IconSpinner />
                </span>
              )}
            </button>
            <button className="qa-card-pill qa-card-pill--cancel" onClick={() => setEditing(false)} disabled={saving} aria-label="Cancel">
              <IconX />
            </button>
          </>
        ) : (
          <>
            <button className="qa-card-pill qa-card-pill--edit" onClick={startEdit}>
              Edit
            </button>
            <div className="qa-card-flag-wrap">
              <button
                className="qa-card-pill qa-card-pill--flag"
                onClick={() => setFlagMenuOpen(o => !o)}
                disabled={!!flaggingReason}
              >
                Discard
              </button>
              {flagMenuOpen && (
                <div className="qa-card-flag-menu">
                  {FLAG_REASONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => handleFlag(r.value)}
                      disabled={!!flaggingReason}
                    >
                      {flaggingReason === r.value ? <IconSpinner /> : <IconX />}
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <span className="qa-card-level">L{qa.difficulty_level}</span>
      </div>

      {saveError && <p className="qa-card-error">{saveError}</p>}

      {!editing && qa.edited_by_name && (
        <p className="qa-card-footnote">
          — edited by {qa.edited_by_name}{qa.edited_by_school ? ` @ ${qa.edited_by_school}` : ''}
        </p>
      )}
    </div>
  )
}
