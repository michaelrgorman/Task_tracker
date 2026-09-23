import { useState } from 'react'
import { PRIORITIES } from './constants'

export default function TaskDetail({ task, subtasks, onBack, onUpdateTask, onDeleteTask, onAddSubtask, onToggleSubtask, onDeleteSubtask }) {
  const [title, setTitle] = useState(task.title)
  const [newSubtask, setNewSubtask] = useState('')

  function saveTitle() {
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdateTask(task.id, { title: trimmed })
    } else {
      setTitle(task.title)
    }
  }

  function handleSubtaskSubmit(e) {
    e.preventDefault()
    if (!newSubtask.trim()) return
    onAddSubtask(task.id, newSubtask.trim())
    setNewSubtask('')
  }

  return (
    <div className="shell">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="detail-card">
        <div className="detail-top">
          <label className="check big">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onUpdateTask(task.id, { completed: !task.completed })}
            />
          </label>
          <input
            className="detail-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={saveTitle}
          />
        </div>

        <div className="detail-section">
          <div className="detail-label">Priority</div>
          <div className="priority-picker">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                className={`priority-chip ${task.priority === p.value ? 'active' : ''}`}
                style={{ '--chip-color': p.color }}
                onClick={() => onUpdateTask(task.id, { priority: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-label">Due date</div>
          <input
            type="date"
            className="date-input"
            value={task.due_date || ''}
            onChange={e => onUpdateTask(task.id, { due_date: e.target.value || null })}
          />
        </div>

        <div className="detail-section">
          <div className="detail-label">Subtasks</div>
          {subtasks.length === 0 && <p className="muted">No subtasks yet.</p>}
          {subtasks.map(sub => (
            <div className="row row-subtask" key={sub.id}>
              <label className="check">
                <input type="checkbox" checked={sub.completed} onChange={() => onToggleSubtask(sub)} />
              </label>
              <span className={`title leader ${sub.completed ? 'done' : ''}`}>{sub.title}</span>
              <div className="row-actions">
                <button className="icon-btn danger" onClick={() => onDeleteSubtask(sub.id)}>×</button>
              </div>
            </div>
          ))}
          <form className="row inline-add" onSubmit={handleSubtaskSubmit}>
            <input
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              placeholder="New subtask"
            />
            <button type="submit">Add</button>
          </form>
        </div>

        <button className="delete-task-btn" onClick={() => onDeleteTask(task.id)}>Delete task</button>
      </div>
    </div>
  )
}
