import { useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import EditableText from './EditableText'

marked.setOptions({ breaks: true })

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderMarkdownWithLinks(content, notesByTitle) {
  const withLinks = (content || '').replace(/\[\[([^\]]+)\]\]/g, (match, rawTitle) => {
    const title = rawTitle.trim()
    const existing = notesByTitle.get(title.toLowerCase())
    const target = existing ? existing.id : `new:${encodeURIComponent(title)}`
    return `[${title}](#note:${target})`
  })
  return marked.parse(withLinks)
}

function getBacklinks(note, allNotes) {
  if (!note) return []
  const pattern = new RegExp(`\\[\\[\\s*${escapeRegex(note.title)}\\s*\\]\\]`, 'i')
  return allNotes.filter(n => n.id !== note.id && pattern.test(n.content || ''))
}

// Build a folder tree from each note's `folder` field, splitting on "/" so
// "Work/Projects" nests Projects inside Work. Notes with no folder go in root.notes.
function buildTree(notes) {
  const root = { name: '', path: '', children: new Map(), notes: [] }
  notes.forEach(note => {
    if (!note.folder) {
      root.notes.push(note)
      return
    }
    const parts = note.folder.split('/').map(p => p.trim()).filter(Boolean)
    let current = root
    let pathAcc = ''
    for (const part of parts) {
      pathAcc = pathAcc ? `${pathAcc}/${part}` : part
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, path: pathAcc, children: new Map(), notes: [] })
      }
      current = current.children.get(part)
    }
    current.notes.push(note)
  })
  return root
}

function NoteLeaf({ note, depth, isActive, onOpenNote, onDragStart, onDragMove, onDragEnd, isDragging }) {
  return (
    <div
      className={`note-leaf ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ paddingLeft: depth * 14 }}
      onClick={() => onOpenNote(note)}
    >
      <span
        className="drag-handle small"
        onPointerDown={(e) => onDragStart(e, note.id)}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onClick={(e) => e.stopPropagation()}
      >⋮⋮</span>
      📄 {note.title}
    </div>
  )
}

function FolderNode({ node, depth, expanded, onToggle, activeNoteId, onOpenNote, onAddNoteHere, registerRef, dragOverPath, draggingNoteId, onDragStart, onDragMove, onDragEnd }) {
  const isOpen = expanded.has(node.path)
  const childFolders = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name))
  const sortedNotes = [...node.notes].sort((a, b) => a.title.localeCompare(b.title))
  const indent = depth * 14

  return (
    <div className="folder-node">
      <div
        className={`folder-row ${dragOverPath === node.path ? 'drag-over' : ''}`}
        style={{ paddingLeft: indent }}
        ref={(el) => registerRef(node.path, el)}
        onClick={() => onToggle(node.path)}
      >
        <span className={`chevron ${isOpen ? 'open' : ''}`}>▸</span>
        <span className="folder-name">📁 {node.name}</span>
        <button
          type="button"
          className="icon-btn add folder-add-btn"
          title="New note in this folder"
          onClick={(e) => { e.stopPropagation(); onAddNoteHere(node.path); if (!isOpen) onToggle(node.path) }}
        >＋</button>
      </div>
      {isOpen && (
        <div className="folder-children">
          {childFolders.map(child => (
            <FolderNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              activeNoteId={activeNoteId}
              onOpenNote={onOpenNote}
              onAddNoteHere={onAddNoteHere}
              registerRef={registerRef}
              dragOverPath={dragOverPath}
              draggingNoteId={draggingNoteId}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          ))}
          {sortedNotes.map(note => (
            <NoteLeaf
              key={note.id}
              note={note}
              depth={depth + 1}
              isActive={activeNoteId === note.id}
              isDragging={draggingNoteId === note.id}
              onOpenNote={onOpenNote}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Notes({ notes, onBack, onCreateNote, onUpdateNote, onDeleteNote, onDuplicateNote }) {
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [expandedFolders, setExpandedFolders] = useState(new Set(['__uncat__']))
  const [previewMode, setPreviewMode] = useState(true)
  const [draftContent, setDraftContent] = useState('')
  const [folderInput, setFolderInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const folderRefs = useRef(new Map())
  const textareaRef = useRef(null)
  const [dragState, setDragState] = useState(null) // { noteId, overPath }

  const notesByTitle = useMemo(() => {
    const map = new Map()
    notes.forEach(n => map.set(n.title.trim().toLowerCase(), n))
    return map
  }, [notes])

  const tree = useMemo(() => buildTree(notes), [notes])
  const activeNote = notes.find(n => n.id === activeNoteId) || null
  const rootNotes = [...tree.notes].sort((a, b) => a.title.localeCompare(b.title))
  const topFolders = Array.from(tree.children.values()).sort((a, b) => a.name.localeCompare(b.name))

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return null
    return notes
      .filter(n => n.title.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q))
      .map(n => ({ note: n, titleMatch: n.title.toLowerCase().includes(q) }))
      .sort((a, b) => (b.titleMatch ? 1 : 0) - (a.titleMatch ? 1 : 0))
  }, [notes, searchQuery])

  function getExcerpt(content, query) {
    if (!content) return ''
    const idx = content.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return content.slice(0, 80).replace(/\n/g, ' ')
    const start = Math.max(0, idx - 30)
    const end = Math.min(content.length, idx + query.length + 30)
    return (start > 0 ? '…' : '') + content.slice(start, end).replace(/\n/g, ' ') + (end < content.length ? '…' : '')
  }

  function registerRef(path, el) {
    if (el) folderRefs.current.set(path, el)
    else folderRefs.current.delete(path)
  }

  function toggleFolder(path) {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  function openNote(note) {
    setActiveNoteId(note.id)
    setDraftContent(note.content || '')
    setFolderInput(note.folder || '')
    setTagsInput((note.tags || []).join(', '))
    setPreviewMode(true)
  }

  function closeNote() {
    setActiveNoteId(null)
  }

  async function handleNewNote(folderPath = null) {
    const note = await onCreateNote({ title: 'Untitled note', content: '', folder: folderPath, tags: [] })
    if (note) openNote(note)
  }

  function saveContent() {
    if (activeNote && draftContent !== (activeNote.content || '')) {
      onUpdateNote(activeNote.id, { content: draftContent })
    }
  }

  // Wraps the selection (bold/italic) or prefixes the current line (headings/lists).
  function applyFormat(prefix, suffix = '', lineLevel = false) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = draftContent
    let next, newStart, newEnd

    if (lineLevel) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
      newStart = start + prefix.length
      newEnd = end + prefix.length
    } else {
      const selected = value.slice(start, end)
      next = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
      newStart = start + prefix.length
      newEnd = start + prefix.length + selected.length
    }

    setDraftContent(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newStart, newEnd)
    })
  }

  function saveFolder() {
    if (activeNote) onUpdateNote(activeNote.id, { folder: folderInput.trim() || null })
  }

  function saveTags() {
    if (activeNote) {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      onUpdateNote(activeNote.id, { tags })
    }
  }

  async function handleDuplicate() {
    const copy = await onDuplicateNote(activeNote)
    if (copy) openNote(copy)
  }

  function handleLinkClick(e) {
    const a = e.target.closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (href.startsWith('#note:')) {
      e.preventDefault()
      const target = href.slice(6)
      if (target.startsWith('new:')) {
        const title = decodeURIComponent(target.slice(4))
        onCreateNote({ title, content: '', folder: null, tags: [] }).then(n => { if (n) openNote(n) })
      } else {
        const found = notes.find(n => n.id === target)
        if (found) openNote(found)
      }
    }
  }

  // --- drag a note leaf onto a folder row to move it ---
  function startNoteDrag(e, noteId) {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    setDragState({ noteId, overPath: null })
  }

  function onNoteDragMove(e) {
    if (!dragState) return
    e.preventDefault()
    const x = e.clientX
    const y = e.clientY
    let hoveredPath = null
    for (const [path, el] of folderRefs.current.entries()) {
      const rect = el.getBoundingClientRect()
      if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) {
        hoveredPath = path
        break
      }
    }
    if (hoveredPath !== dragState.overPath) {
      setDragState({ ...dragState, overPath: hoveredPath })
    }
  }

  function endNoteDrag() {
    if (!dragState) return
    const { noteId, overPath } = dragState
    setDragState(null)
    if (overPath === null) return // dropped somewhere that isn't a folder target — no-op
    const newFolder = overPath === '__uncat__' ? null : overPath
    const note = notes.find(n => n.id === noteId)
    if (note && (note.folder || null) !== newFolder) {
      onUpdateNote(noteId, { folder: newFolder })
    }
  }

  const backlinks = activeNote ? getBacklinks(activeNote, notes) : []
  const uncatOpen = expandedFolders.has('__uncat__')

  return (
    <div className="shell notes-shell">
      <div className="notes-topbar">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2 className="section-heading">Notes</h2>
      </div>

      <div className="notes-layout">
        <div className={`notes-sidebar ${activeNote ? 'mobile-hidden' : ''}`}>
          <button className="primary-btn notes-new-btn" onClick={() => handleNewNote(null)}>+ New note</button>
          <input
            className="date-input notes-search-input"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="🔍 Search notes…"
          />
          {notes.length === 0 && <p className="empty">No notes yet.</p>}

          {searchResults ? (
            <div className="search-results">
              {searchResults.length === 0 && <p className="empty">No matches.</p>}
              {searchResults.map(({ note }) => (
                <div
                  key={note.id}
                  className={`note-leaf search-result ${activeNoteId === note.id ? 'active' : ''}`}
                  onClick={() => openNote(note)}
                >
                  <div className="search-result-title">📄 {note.title}</div>
                  <div className="search-result-meta">{note.folder || 'Uncategorised'}</div>
                  {getExcerpt(note.content, searchQuery) && (
                    <div className="search-result-excerpt">{getExcerpt(note.content, searchQuery)}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="folder-node">
                <div
                  className={`folder-row ${dragState?.overPath === '__uncat__' ? 'drag-over' : ''}`}
                  ref={(el) => registerRef('__uncat__', el)}
                  onClick={() => toggleFolder('__uncat__')}
                >
                  <span className={`chevron ${uncatOpen ? 'open' : ''}`}>▸</span>
                  <span className="folder-name">🗂 Uncategorised</span>
                  <button
                    type="button"
                    className="icon-btn add folder-add-btn"
                    title="New note here"
                    onClick={(e) => { e.stopPropagation(); handleNewNote(null); if (!uncatOpen) toggleFolder('__uncat__') }}
                  >＋</button>
                </div>
                {uncatOpen && (
                  <div className="folder-children">
                    {rootNotes.map(note => (
                      <NoteLeaf
                        key={note.id}
                        note={note}
                        depth={1}
                        isActive={activeNoteId === note.id}
                        isDragging={dragState?.noteId === note.id}
                        onOpenNote={openNote}
                        onDragStart={startNoteDrag}
                        onDragMove={onNoteDragMove}
                        onDragEnd={endNoteDrag}
                      />
                    ))}
                  </div>
                )}
              </div>

              {topFolders.map(folder => (
                <FolderNode
                  key={folder.path}
                  node={folder}
                  depth={0}
                  expanded={expandedFolders}
                  onToggle={toggleFolder}
                  activeNoteId={activeNoteId}
                  onOpenNote={openNote}
                  onAddNoteHere={handleNewNote}
                  registerRef={registerRef}
                  dragOverPath={dragState?.overPath}
                  draggingNoteId={dragState?.noteId}
                  onDragStart={startNoteDrag}
                  onDragMove={onNoteDragMove}
                  onDragEnd={endNoteDrag}
                />
              ))}
            </>
          )}
        </div>

        <div className={`notes-main ${!activeNote ? 'mobile-hidden' : ''}`}>
          {activeNote ? (
            <div className="detail-card">
              <button className="back-btn mobile-only" onClick={closeNote}>← All notes</button>

              <EditableText
                value={activeNote.title}
                onSave={(v) => onUpdateNote(activeNote.id, { title: v })}
                className="title project-title"
              />

              <div className="detail-section">
                <div className="detail-label">Folder</div>
                <input
                  className="date-input"
                  value={folderInput}
                  onChange={e => setFolderInput(e.target.value)}
                  onBlur={saveFolder}
                  placeholder="e.g. Work/Projects"
                />
              </div>

              <div className="detail-section">
                <div className="detail-label">Tags (comma separated)</div>
                <input
                  className="date-input"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  onBlur={saveTags}
                  placeholder="e.g. recipe, urgent"
                />
              </div>

              <div className="detail-section">
                <div className="note-editor-header">
                  <div className="detail-label">Content</div>
                  <button type="button" className="nav-btn" onClick={() => { if (!previewMode) saveContent(); setPreviewMode(p => !p) }}>
                    {previewMode ? '✎ Edit' : '👁 Preview'}
                  </button>
                </div>

                {previewMode ? (
                  <div
                    className="note-preview"
                    onClick={handleLinkClick}
                    dangerouslySetInnerHTML={{ __html: renderMarkdownWithLinks(activeNote.content, notesByTitle) }}
                  />
                ) : (
                  <>
                    <div className="note-toolbar">
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('# ', '', true)}>H1</button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('## ', '', true)}>H2</button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('### ', '', true)}>H3</button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('**', '**')}><b>B</b></button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('*', '*')}><i>I</i></button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('- ', '', true)}>• List</button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('1. ', '', true)}>1. List</button>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('- [ ] ', '', true)}>☐ Check</button>
                    </div>
                    <textarea
                      ref={textareaRef}
                      className="note-textarea"
                      value={draftContent}
                      onChange={e => setDraftContent(e.target.value)}
                      onBlur={saveContent}
                      placeholder="Write in Markdown. Use [[Page Title]] to link to (or create) another note."
                      autoFocus
                    />
                  </>
                )}
              </div>

              {backlinks.length > 0 && (
                <div className="detail-section">
                  <div className="detail-label">Linked from</div>
                  <div>
                    {backlinks.map(n => (
                      <button key={n.id} className="backlink-item" onClick={() => openNote(n)}>
                        {n.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-actions-row">
                <button className="nav-btn" onClick={handleDuplicate}>⎘ Duplicate note</button>
                <button className="delete-task-btn" onClick={() => { onDeleteNote(activeNote.id); closeNote() }}>Delete note</button>
              </div>
            </div>
          ) : (
            <p className="empty notes-placeholder">Select a note from the list, or create a new one.</p>
          )}
        </div>
      </div>
    </div>
  )
}
