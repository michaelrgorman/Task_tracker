import { useState } from 'react'
import EditableText from './EditableText'

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

function describeRule(rule) {
  if (rule.frequency === 'daily') return 'Every day'
  if (rule.frequency === 'weekly') {
    const days = (rule.days_of_week || []).slice().sort()
    const labels = days.map(d => WEEKDAYS.find(w => w.value === d)?.label).filter(Boolean)
    return labels.length ? `Every ${labels.join(', ')}` : 'Weekly'
  }
  if (rule.frequency === 'monthly') return `Monthly on day ${rule.day_of_month}`
  return ''
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function RecurringRules({ rules, projects, onBack, onAddRule, onUpdateRule, onDeleteRule }) {
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [frequency, setFrequency] = useState('weekly')
  const [daysOfWeek, setDaysOfWeek] = useState([1])
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [startDate, setStartDate] = useState(todayISO())

  function toggleDay(d) {
    setDaysOfWeek(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  function submit(e) {
    e.preventDefault()
    if (!title.trim() || !projectId) return
    onAddRule({
      title: title.trim(),
      project_id: projectId,
      frequency,
      days_of_week: frequency === 'weekly' ? daysOfWeek : null,
      day_of_month: frequency === 'monthly' ? Number(dayOfMonth) : null,
      start_date: startDate,
      active: true,
    })
    setTitle('')
  }

  return (
    <div className="shell">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <h2 className="section-heading">Recurring tasks</h2>

      <div className="card">
        {rules.length === 0 && <p className="empty">No recurring rules yet.</p>}
        {rules.map(rule => {
          const project = projects.find(p => p.id === rule.project_id)
          return (
            <div className="row-group" key={rule.id}>
              <div className="row rule-row">
                <div className="rule-info">
                  <EditableText
                    value={rule.title}
                    onSave={(v) => onUpdateRule(rule.id, { title: v })}
                    className={`title ${!rule.active ? 'done' : ''}`}
                  />
                  <span className="rule-meta">{describeRule(rule)} · {project?.title || 'Unknown project'}</span>
                </div>
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    title={rule.active ? 'Pause' : 'Resume'}
                    onClick={() => onUpdateRule(rule.id, { active: !rule.active })}
                  >{rule.active ? '⏸' : '▶'}</button>
                  <button className="icon-btn danger" title="Delete rule" onClick={() => onDeleteRule(rule.id)}>×</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form className="detail-card rule-form" onSubmit={submit}>
        <div className="detail-section">
          <div className="detail-label">Task title</div>
          <input
            className="date-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Take out the bins"
          />
        </div>

        <div className="detail-section">
          <div className="detail-label">Project</div>
          <select className="date-input" value={projectId} onChange={e => setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>

        <div className="detail-section">
          <div className="detail-label">Repeats</div>
          <div className="priority-picker">
            {['daily', 'weekly', 'monthly'].map(f => (
              <button
                type="button"
                key={f}
                className={`priority-chip ${frequency === f ? 'active' : ''}`}
                style={{ '--chip-color': '#7C3AED' }}
                onClick={() => setFrequency(f)}
              >{f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className="detail-section">
            <div className="detail-label">On</div>
            <div className="priority-picker">
              {WEEKDAYS.map(w => (
                <button
                  type="button"
                  key={w.value}
                  className={`priority-chip ${daysOfWeek.includes(w.value) ? 'active' : ''}`}
                  style={{ '--chip-color': '#7C3AED' }}
                  onClick={() => toggleDay(w.value)}
                >{w.label}</button>
              ))}
            </div>
          </div>
        )}

        {frequency === 'monthly' && (
          <div className="detail-section">
            <div className="detail-label">Day of month</div>
            <input
              type="number" min="1" max="31" className="date-input"
              value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)}
            />
          </div>
        )}

        <div className="detail-section">
          <div className="detail-label">Starting from</div>
          <input
            type="date" className="date-input"
            value={startDate} onChange={e => setStartDate(e.target.value)}
          />
        </div>

        <button type="submit" className="primary-btn">+ Add recurring rule</button>
      </form>
    </div>
  )
}
