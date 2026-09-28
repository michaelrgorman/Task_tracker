import { useEffect, useRef, useState } from 'react'
import { supabaseClient } from './supabaseClient'
import TaskDetail from './TaskDetail'
import RecurringRules from './RecurringRules'
import EditableText from './EditableText'
import { PRIORITIES } from './constants'

function useToggleSet() {
  const [set, setSet] = useState(new Set())
  const toggle = (id) => {
    setSet(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  return [set, toggle]
}

const PALETTE = ['#FF6B6B', '#4ECDC4', '#FFB84C', '#A78BFA', '#FF8FAB', '#4D96FF', '#6BCB77', '#F76E11']

export default function App() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [subtasks, setSubtasks] = useState([])
  const [recurringRules, setRecurringRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openProjects, toggleProject] = useToggleSet()
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [addingTaskFor, setAddingTaskFor] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')

  const [view, setView] = useState('home') // 'home' | 'detail' | 'recurring'
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('nestlist-dark') === 'true' } catch { return false }
  })

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode)
    try { localStorage.setItem('nestlist-dark', darkMode ? 'true' : 'false') } catch { /* ignore */ }
  }, [darkMode])

  const rowRefs = useRef(new Map())
  const [dragInfo, setDragInfo] = useState(null) // tasks: { projectId, order: [taskId...], draggingId }
  const projectRefs = useRef(new Map())
  const [projectDrag, setProjectDrag] = useState(null) // projects: { order: [projectId...], draggingId }

  useEffect(() => { initialize() }, [])

  async function initialize() {
    setLoading(true)
    await generateDueTasks()
    await loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [p, t, s, r] = await Promise.all([
      supabaseClient.from('Todo_Project').select('*').order('position', { ascending: true, nullsFirst: false }).order('created_at'),
      supabaseClient.from('Todo_Task').select('*').order('position', { ascending: true, nullsFirst: false }).order('created_at'),
      supabaseClient.from('Todo_Subtask').select('*').order('created_at'),
      supabaseClient.from('Todo_RecurringRule').select('*').order('created_at'),
    ])
    if (p.error || t.error || s.error || r.error) {
      setError((p.error || t.error || s.error || r.error).message)
    } else {
      setProjects(p.data)
      setTasks(t.data)
      setSubtasks(s.data)
      setRecurringRules(r.data)
      setError(null)
    }
    setLoading(false)
  }

  // --- recurring task generation ---
  function addDays(date, n) {
    const d = new Date(date)
    d.setDate(d.getDate() + n)
    return d
  }

  function formatDate(date) {
    return date.toISOString().slice(0, 10)
  }

  function matchesRule(rule, date) {
    if (rule.frequency === 'daily') return true
    if (rule.frequency === 'weekly') return (rule.days_of_week || []).includes(date.getDay())
    if (rule.frequency === 'monthly') return date.getDate() === rule.day_of_month
    return false
  }

  function occurrencesToGenerate(rule, today) {
    const startFromLast = rule.last_generated_date ? addDays(new Date(rule.last_generated_date), 1) : new Date(rule.start_date)
    const ruleStart = new Date(rule.start_date)
    const backfillCap = addDays(today, -30) // never backfill more than 30 days
    let cursor = startFromLast > ruleStart ? startFromLast : ruleStart
    if (cursor < backfillCap) cursor = backfillCap
    const results = []
    let d = cursor
    while (d <= today) {
      if (matchesRule(rule, d)) results.push(formatDate(d))
      d = addDays(d, 1)
    }
    return results
  }

  async function generateDueTasks() {
    const { data: rules, error } = await supabaseClient.from('Todo_RecurringRule').select('*').eq('active', true)
    if (error || !rules || rules.length === 0) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const rule of rules) {
      const dates = occurrencesToGenerate(rule, today)
      if (dates.length === 0) continue

      const { data: existing } = await supabaseClient
        .from('Todo_Task')
        .select('due_date')
        .eq('recurrence_rule_id', rule.id)
      const existingDates = new Set((existing || []).map(t => t.due_date))
      const toInsert = dates
        .filter(d => !existingDates.has(d))
        .map(d => ({
          project_id: rule.project_id,
          title: rule.title,
          due_date: d,
          recurrence_rule_id: rule.id,
        }))

      if (toInsert.length > 0) {
        await supabaseClient.from('Todo_Task').insert(toInsert)
      }
      await supabaseClient.from('Todo_RecurringRule').update({ last_generated_date: dates[dates.length - 1] }).eq('id', rule.id)
    }
  }

  function byPosition(a, b) {
    const pa = a.position ?? 1e9
    const pb = b.position ?? 1e9
    if (pa !== pb) return pa - pb
    return new Date(a.created_at) - new Date(b.created_at)
  }

  function tasksForProject(projectId) {
    const base = tasks.filter(t => t.project_id === projectId).sort(byPosition)
    const ordered = (dragInfo && dragInfo.projectId === projectId)
      ? dragInfo.order.map(id => base.find(t => t.id === id)).filter(Boolean)
      : base
    return hideCompleted ? ordered.filter(t => !t.completed) : ordered
  }

  async function addProject(e) {
    e.preventDefault()
    if (!newProjectTitle.trim()) return
    const { error } = await supabaseClient.from('Todo_Project').insert({ title: newProjectTitle.trim(), position: projects.length })
    if (error) { setError(error.message); return }
    setNewProjectTitle('')
    loadAll()
  }

  async function updateProject(id, fields) {
    const { error } = await supabaseClient.from('Todo_Project').update(fields).eq('id', id)
    if (error) { setError(error.message); return }
    loadAll()
  }

  async function addTask(projectId) {
    if (!draftTitle.trim()) return
    const existingCount = tasks.filter(t => t.project_id === projectId).length
    const { error } = await supabaseClient.from('Todo_Task').insert({
      project_id: projectId,
      title: draftTitle.trim(),
      position: existingCount,
    })
    if (error) { setError(error.message); return }
    setDraftTitle('')
    setAddingTaskFor(null)
    loadAll()
  }

  async function addSubtask(taskId, title) {
    const { error } = await supabaseClient.from('Todo_Subtask').insert({ task_id: taskId, title })
    if (error) { setError(error.message); return }
    loadAll()
  }

  async function updateTask(id, fields) {
    const { error } = await supabaseClient.from('Todo_Task').update(fields).eq('id', id)
    if (error) { setError(error.message); return }
    loadAll()
  }

  async function toggleTaskDone(task) {
    await supabaseClient.from('Todo_Task').update({ completed: !task.completed }).eq('id', task.id)
    loadAll()
  }

  async function toggleSubtaskDone(subtask) {
    await supabaseClient.from('Todo_Subtask').update({ completed: !subtask.completed }).eq('id', subtask.id)
    loadAll()
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project and everything inside it?')) return
    await supabaseClient.from('Todo_Project').delete().eq('id', id)
    loadAll()
  }

  async function deleteTaskAndReturn(id) {
    if (!confirm('Delete this task and its subtasks?')) return
    await supabaseClient.from('Todo_Task').delete().eq('id', id)
    setView('home')
    loadAll()
  }

  async function deleteSubtask(id) {
    await supabaseClient.from('Todo_Subtask').delete().eq('id', id)
    loadAll()
  }

  async function updateSubtask(id, fields) {
    const { error } = await supabaseClient.from('Todo_Subtask').update(fields).eq('id', id)
    if (error) { setError(error.message); return }
    loadAll()
  }

  async function duplicateTask(task) {
    const { data: newTask, error } = await supabaseClient
      .from('Todo_Task')
      .insert({
        project_id: task.project_id,
        title: `${task.title} (copy)`,
        priority: task.priority,
        completed: false,
      })
      .select()
      .single()
    if (error) { setError(error.message); return }

    const relatedSubtasks = subtasks.filter(s => s.task_id === task.id)
    if (relatedSubtasks.length > 0) {
      await supabaseClient.from('Todo_Subtask').insert(
        relatedSubtasks.map(s => ({ task_id: newTask.id, title: s.title, completed: false }))
      )
    }
    await loadAll()
    setSelectedTaskId(newTask.id)
  }

  async function addRule(fields) {
    const { error } = await supabaseClient.from('Todo_RecurringRule').insert(fields)
    if (error) { setError(error.message); return }
    initialize()
  }

  async function updateRule(id, fields) {
    const { error } = await supabaseClient.from('Todo_RecurringRule').update(fields).eq('id', id)
    if (error) { setError(error.message); return }
    loadAll()
  }

  async function deleteRule(id) {
    if (!confirm('Delete this recurring rule? Tasks already created from it will stay.')) return
    await supabaseClient.from('Todo_RecurringRule').delete().eq('id', id)
    loadAll()
  }

  function openTaskDetail(taskId) {
    setSelectedTaskId(taskId)
    setView('detail')
  }

  function goHome() {
    setView('home')
    setSelectedTaskId(null)
  }

  // Insert the dragged item before the first other item whose midpoint is below the
  // pointer. Items with no row on screen (e.g. hidden completed ones) are skipped.
  function reorderByPointer(order, draggingId, y, refs) {
    let beforeId = null
    for (const id of order) {
      if (id === draggingId) continue
      const el = refs.get(id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (y < rect.top + rect.height / 2) { beforeId = id; break }
    }
    const rest = order.filter(id => id !== draggingId)
    const at = beforeId ? rest.indexOf(beforeId) : rest.length
    return [...rest.slice(0, at), draggingId, ...rest.slice(at)]
  }

  // --- drag to reorder tasks within a project ---
  function startDrag(e, projectId, taskId) {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    const order = tasks.filter(t => t.project_id === projectId).sort(byPosition).map(t => t.id)
    setDragInfo({ projectId, order, draggingId: taskId })
  }

  function onDragMove(e) {
    if (!dragInfo) return
    e.preventDefault()
    const next = reorderByPointer(dragInfo.order, dragInfo.draggingId, e.clientY, rowRefs.current)
    if (next.join() !== dragInfo.order.join()) setDragInfo({ ...dragInfo, order: next })
  }

  async function endDrag() {
    if (!dragInfo) return
    const { order } = dragInfo
    setDragInfo(null)
    setTasks(prev => prev.map(t => {
      const idx = order.indexOf(t.id)
      return idx === -1 ? t : { ...t, position: idx }
    }))
    const results = await Promise.all(order.map((id, idx) =>
      supabaseClient.from('Todo_Task').update({ position: idx }).eq('id', id)
    ))
    const failed = results.find(r => r.error)
    if (failed) setError(failed.error.message)
    loadAll()
  }

  // --- drag to reorder projects ---
  function orderedProjects() {
    if (projectDrag) return projectDrag.order.map(id => projects.find(p => p.id === id)).filter(Boolean)
    return [...projects].sort((a, b) =>
      a.completed === b.completed ? byPosition(a, b) : (a.completed ? 1 : -1)
    )
  }

  function startProjectDrag(e, projectId) {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    setProjectDrag({ order: orderedProjects().map(p => p.id), draggingId: projectId })
  }

  function onProjectDragMove(e) {
    if (!projectDrag) return
    e.preventDefault()
    const next = reorderByPointer(projectDrag.order, projectDrag.draggingId, e.clientY, projectRefs.current)
    if (next.join() !== projectDrag.order.join()) setProjectDrag({ ...projectDrag, order: next })
  }

  async function endProjectDrag() {
    if (!projectDrag) return
    const { order } = projectDrag
    setProjectDrag(null)
    setProjects(prev => prev.map(p => ({ ...p, position: order.indexOf(p.id) })))
    const results = await Promise.all(order.map((id, idx) =>
      supabaseClient.from('Todo_Project').update({ position: idx }).eq('id', id)
    ))
    const failed = results.find(r => r.error)
    if (failed) setError(failed.error.message)
    loadAll()
  }

  if (loading) return <div className="shell"><p className="muted">Loading…</p></div>

  if (view === 'detail') {
    const selectedTask = tasks.find(t => t.id === selectedTaskId)
    if (!selectedTask) {
      goHome()
      return null
    }
    const selectedSubtasks = subtasks.filter(s => s.task_id === selectedTaskId)
    return (
      <TaskDetail
        task={selectedTask}
        subtasks={selectedSubtasks}
        onBack={goHome}
        onUpdateTask={updateTask}
        onDeleteTask={deleteTaskAndReturn}
        onAddSubtask={addSubtask}
        onToggleSubtask={toggleSubtaskDone}
        onDeleteSubtask={deleteSubtask}
        onRenameSubtask={(id, title) => updateSubtask(id, { title })}
        onDuplicateTask={() => duplicateTask(selectedTask)}
      />
    )
  }

  if (view === 'recurring') {
    return (
      <RecurringRules
        rules={recurringRules}
        projects={projects}
        onBack={goHome}
        onAddRule={addRule}
        onUpdateRule={updateRule}
        onDeleteRule={deleteRule}
      />
    )
  }

  return (
    <div className="shell">
      <header className="stamp">
        <div className="stamp-row">
          <div>
            <h1>Nestlist</h1>
            <p className="tagline">a place for everything nested</p>
          </div>
          <div className="nav-actions">
            <button className="nav-btn" onClick={() => setDarkMode(d => !d)}>
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button className="nav-btn" onClick={() => setHideCompleted(h => !h)}>
              {hideCompleted ? '☑ Show completed' : '☐ Hide completed'}
            </button>
            <button className="nav-btn" onClick={() => setView('recurring')}>↻ Recurring</button>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="card">
        {projects.length === 0 && (
          <p className="empty">No projects yet — start one below.</p>
        )}

        {(() => {
          // Colour is tied to creation order, so it stays put when projects are reordered.
          const createdOrder = [...projects].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          const colorFor = (id) => {
            const idx = createdOrder.findIndex(p => p.id === id)
            return PALETTE[idx % PALETTE.length]
          }
          const displayProjects = orderedProjects()
          const visibleProjects = hideCompleted ? displayProjects.filter(p => !p.completed) : displayProjects
          return visibleProjects.map((project) => {
            const projectTasks = tasksForProject(project.id)
            const isOpen = openProjects.has(project.id)
            const color = colorFor(project.id)
            return (
              <div className="row-group" key={project.id} style={{ '--proj-color': color }}>
                <div
                  className={`row row-project ${projectDrag?.draggingId === project.id ? 'dragging' : ''}`}
                  ref={(el) => { if (el) projectRefs.current.set(project.id, el); else projectRefs.current.delete(project.id) }}
                  onClick={() => toggleProject(project.id)}
                >
                  <span
                    className="drag-handle"
                    title="Drag to reorder"
                    onPointerDown={(e) => startProjectDrag(e, project.id)}
                    onPointerMove={onProjectDragMove}
                    onPointerUp={endProjectDrag}
                    onClick={(e) => e.stopPropagation()}
                  >⋮⋮</span>
                  <label className="check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={project.completed}
                      onChange={() => updateProject(project.id, { completed: !project.completed })}
                    />
                  </label>
                  <span className="proj-dot" />
                  <span className={`chevron ${isOpen ? 'open' : ''}`}>▸</span>
                  <EditableText
                    value={project.title}
                    onSave={(v) => updateProject(project.id, { title: v })}
                    className={`title project-title ${project.completed ? 'done' : ''}`}
                  />
                  <div className="row-actions">
                    <button className="icon-btn add" title="Add task" onClick={(e) => { e.stopPropagation(); setAddingTaskFor(project.id); setDraftTitle(''); if (!isOpen) toggleProject(project.id) }}>＋</button>
                    <button className="icon-btn danger" title="Delete project" onClick={(e) => { e.stopPropagation(); deleteProject(project.id) }}>×</button>
                  </div>
                </div>

                {isOpen && (
                  <div className="indent">
                    {projectTasks.map(task => {
                      const priorityMeta = PRIORITIES[task.priority] || PRIORITIES[0]
                      return (
                        <div
                          className={`row row-task ${dragInfo?.draggingId === task.id ? 'dragging' : ''}`}
                          key={task.id}
                          ref={(el) => { if (el) rowRefs.current.set(task.id, el); else rowRefs.current.delete(task.id) }}
                          onClick={() => openTaskDetail(task.id)}
                        >
                          <span
                            className="drag-handle"
                            onPointerDown={(e) => startDrag(e, project.id, task.id)}
                            onPointerMove={onDragMove}
                            onPointerUp={endDrag}
                            onClick={(e) => e.stopPropagation()}
                          >⋮⋮</span>
                          <label className="check" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={task.completed} onChange={() => toggleTaskDone(task)} />
                          </label>
                          {task.priority > 0 && <span className="priority-dot" style={{ background: priorityMeta.color }} />}
                          <EditableText
                            value={task.title}
                            onSave={(v) => updateTask(task.id, { title: v })}
                            className={`title leader ${task.completed ? 'done' : ''}`}
                          />
                          {task.recurrence_rule_id && <span className="recur-badge" title="Generated from a recurring rule">↻</span>}
                        </div>
                      )
                    })}

                    {addingTaskFor === project.id && (
                      <form className="row inline-add" onSubmit={(e) => { e.preventDefault(); addTask(project.id) }}>
                        <input autoFocus value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Task title" />
                        <button type="submit">Add</button>
                        <button type="button" className="ghost" onClick={() => setAddingTaskFor(null)}>Cancel</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )
          })
        })()}
      </div>

      <form className="new-project" onSubmit={addProject}>
        <input
          value={newProjectTitle}
          onChange={e => setNewProjectTitle(e.target.value)}
          placeholder="New project name…"
        />
        <button type="submit">+ New project</button>
      </form>
    </div>
  )
}
