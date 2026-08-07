import { useRef, useState } from 'react'
import './EditablePhoto.css'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('')
}

// Shared click-to-upload photo tile for the Students/Teachers list cards —
// renders the exact same <img>/initials-placeholder markup either card
// already had (thumbClassName/placeholderClassName are those existing CSS
// classes), just wrapped in a hidden-file-input trigger when the viewer is
// allowed to change this particular photo. Upload/error handling stays with
// the caller (onUpload does the actual API call + store update; onError
// surfaces failures through whatever Toast the caller already has).
export default function EditablePhoto({
  editable, thumbClassName, placeholderClassName, name, photoUrl, onUpload, onError,
}) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const thumb = photoUrl
    ? <img className={thumbClassName} src={photoUrl} alt={name} />
    : <span className={`${thumbClassName} ${placeholderClassName}`}>{initials(name)}</span>

  if (!editable) return thumb

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file next time
    if (!file) return
    if (file.size > MAX_PHOTO_BYTES) {
      onError?.('Photo must be 5MB or smaller.')
      return
    }
    setUploading(true)
    try {
      await onUpload(file)
    } catch (err) {
      onError?.(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <span
      className="editable-photo"
      role="button"
      tabIndex={0}
      onClick={() => fileRef.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
      aria-label={`Change ${name}'s photo`}
    >
      {thumb}
      {uploading && (
        <span className="editable-photo-overlay">
          <span className="editable-photo-spinner" />
        </span>
      )}
      <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} onChange={handleFile} hidden />
    </span>
  )
}
