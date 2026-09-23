import { useState } from 'react'

export default function EditableText({ value, onSave, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function startEdit(e) {
    e.stopPropagation()
    setDraft(value)
    setEditing(true)
  }

  function commit() {
    const trimmed = draft.trim()
    setEditing(false)
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') e.target.blur()
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }

  if (editing) {
    return (
      <input
        autoFocus
        className="editable-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={e => e.stopPropagation()}
      />
    )
  }

  return (
    <span className="editable-wrap">
      <span className={className}>{value}</span>
      <button type="button" className="edit-icon-btn" title="Rename" onClick={startEdit}>✎</button>
    </span>
  )
}
