import React, { useEffect, useState } from 'react'

type Action = {
  id: string
  title: string
  status: 'open' | 'in_progress' | 'closed'
}

const LS_KEY = 'ak_actions'

function loadActions(): Action[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}
function saveActions(list: Action[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

export default function ActionsPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [title, setTitle] = useState('')

  useEffect(() => {
    setActions(loadActions())
  }, [])

  useEffect(() => {
    saveActions(actions)
  }, [actions])

  const addAction = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const a: Action = {
      id: crypto.randomUUID(),
      title: title.trim(),
      status: 'open'
    }
    setActions(prev => [a, ...prev])
    setTitle('')
  }

  const updateStatus = (id: string, status: Action['status']) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  const removeAction = (id: string) => {
    if (!confirm('Delete this action?')) return
    setActions(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="max-w-4xl mx.auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-royal-700">Actions</h1>
        <p className="text-sm text-gray-600">
          Track follow-up actions from inspections.
        </p>
      </div>

      <form onSubmit={addAction} className="bg-white border rounded-2xl p-4 flex gap-2">
        <input
          className="flex-1 border rounded-xl px-3 py-2 text-sm"
          placeholder="New action title"
          value={title}
          onChange={e=>setTitle(e.target.value)}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
        >
          Add
        </button>
      </form>

      <div className="space-y-2">
        {actions.length === 0 && (
          <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
            No actions yet.
          </div>
        )}
        {actions.map(a => (
          <div key={a.id} className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-2">
            <div>
              <div className="font-semibold text-sm">{a.title}</div>
              <div className="text-xs text-gray-500">Status: {a.status}</div>
            </div>
            <div className="flex gap-2 items-center text-xs">
              <select
                value={a.status}
                onChange={e=>updateStatus(a.id, e.target.value as any)}
                className="border rounded-xl px-2 py-1 text-xs"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="closed">Closed</option>
              </select>
              <button
                onClick={()=>removeAction(a.id)}
                className="px-3 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
