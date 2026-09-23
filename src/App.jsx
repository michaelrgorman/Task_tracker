import { useEffect, useState } from 'react'
import { supabaseClient } from './supabaseClient'

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

export default function App() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [subtasks, setSubtasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openProjects, toggleProject] = useToggleSet()
  const [openTasks, toggleTask] = useToggleSet()
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [addingTaskFor, setAddingTaskFor] = useState(null)
  const [addingSubtaskFor, setAddingSubtaskFor] = useState(null)
  const [draftTitle, setDraftTitle] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [p, t, s] = await Promise.all([
      supabaseClient.from('Todo_Project').select('*').order('created_at'),
      supabaseClient.from('Todo_Task').select('*').order('created_at'),
      supabaseClient.from('Todo_Subtask').select('*').order('created_at'),
    ])
    if (p.error || t.error || s.error) {
      setError((p.error || t.error || s.error).message)
    } else {
      setProjects(p.data)
      setTasks(t.data)
      setSubtasks(s.data)
      setError(null)
    }
    setLoading(false)
  }

  async function addProject(e) {
    e.preventDefault()
    if (!newProjectTitle.trim()) return
    const { error } = await supabaseClient.from('Todo_Project').insert({ title: newProjectTitle.trim() })
    if (error) { setError(error.message); return }
    setNewProjectTitle('')
    loadAll()
  }

  async function addTask(projectId) {
    if (!draftTitle.trim()) return
    const { error } = await supabaseClient.from('Todo_Task').insert({ project_id: projectId, title: draftTitle.trim() })
    if (error) { setError(error.message); return }
    setDraftTitle('')
    setAddingTaskFor(null)
    loadAll()
  }

  async function addSubtask(taskId) {
    if (!draftTitle.trim()) return
    const { error } = await supabaseClient.from('Todo_Subtask').insert({ task_id: taskId, title: draftTitle.trim() })
    if (error) { setError(error.message); return }
    setDraftTitle('')
    setAddingSubtaskFor(null)
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

  async function deleteTask(id) {
    if (!confirm('Delete this task and its subtasks?')) return
    await supabaseClient.from('Todo_Task').delete().eq('id', id)
    loadAll()
  }

  async function deleteSubtask(id) {
    await supabaseClient.from('Todo_Subtask').delete().eq('id', id)
    loadAll()
  }

  if (loading) return <div className="shell"><p className="muted">Loading…</p></div>

  return (
    <div className="shell">
      <header className="stamp">
        <h1>Nestlist</h1>
        <p className="tagline">a place for everything nested</p>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="card">
        {projects.length === 0 && (
          <p className="empty">No projects yet — start one below.</p>
        )}

        {projects.map(project => {
          const projectTasks = tasks.filter(t => t.project_id === project.id)
          const isOpen = openProjects.has(project.id)
          return (
            <div className="row-group" key={project.id}>
              <div className="row row-project">
                <button className="disclosure" onClick={() => toggleProject(project.id)}>
                  {isOpen ? '▾' : '▸'}
                </button>
                <span className="title project-title">{project.title}</span>
                <button className="ghost" onClick={() => { setAddingTaskFor(project.id); setDraftTitle('') }}>+ task</button>
                <button className="ghost danger" onClick={() => deleteProject(project.id)}>delete</button>
              </div>

              {isOpen && (
                <div className="indent">
                  {projectTasks.map(task => {
                    const taskSubtasks = subtasks.filter(s => s.task_id === task.id)
                    const taskOpen = openTasks.has(task.id)
                    return (
                      <div className="row-group" key={task.id}>
                        <div className="row row-task">
                          <button className="disclosure" onClick={() => toggleTask(task.id)}>
                            {taskOpen ? '▾' : '▸'}
                          </button>
                          <label className="check">
                            <input type="checkbox" checked={task.completed} onChange={() => toggleTaskDone(task)} />
                          </label>
                          <span className={`title leader ${task.completed ? 'done' : ''}`}>{task.title}</span>
                          <button className="ghost" onClick={() => { setAddingSubtaskFor(task.id); setDraftTitle('') }}>+ sub</button>
                          <button className="ghost danger" onClick={() => deleteTask(task.id)}>delete</button>
                        </div>

                        {taskOpen && (
                          <div className="indent">
                            {taskSubtasks.map(sub => (
                              <div className="row row-subtask" key={sub.id}>
                                <label className="check">
                                  <input type="checkbox" checked={sub.completed} onChange={() => toggleSubtaskDone(sub)} />
                                </label>
                                <span className={`title leader ${sub.completed ? 'done' : ''}`}>{sub.title}</span>
                                <button className="ghost danger" onClick={() => deleteSubtask(sub.id)}>delete</button>
                              </div>
                            ))}

                            {addingSubtaskFor === task.id && (
                              <form className="row inline-add" onSubmit={(e) => { e.preventDefault(); addSubtask(task.id) }}>
                                <input autoFocus value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Subtask title" />
                                <button type="submit">Add</button>
                                <button type="button" className="ghost" onClick={() => setAddingSubtaskFor(null)}>Cancel</button>
                              </form>
                            )}
                          </div>
                        )}
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
        })}
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
