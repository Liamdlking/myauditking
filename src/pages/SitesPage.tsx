import React, { useEffect, useState } from 'react'

type Site = {
  id: string
  name: string
  description?: string
}

const LS_KEY = 'ak_sites'

function loadSites(): Site[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}
function saveSites(list: Site[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    setSites(loadSites())
  }, [])

  useEffect(() => {
    saveSites(sites)
  }, [sites])

  const addSite = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const s: Site = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim() || undefined
    }
    setSites(prev => [s, ...prev])
    setName('')
    setDescription('')
  }

  const deleteSite = (id: string) => {
    if (!confirm('Delete this site?')) return
    setSites(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-royal-700">Sites</h1>
        <p className="text-sm text-gray-600">
          Manage sites / locations for templates and inspections.
        </p>
      </div>

      <form onSubmit={addSite} className="bg-white border rounded-2xl p-4 space-y-3">
        <input
          className="w-full border rounded-xl px-3 py-2 text-sm"
          placeholder="Site name"
          value={name}
          onChange={e=>setName(e.target.value)}
        />
        <textarea
          className="w-full border rounded-xl px-3 py-2 text-sm"
          placeholder="Description (optional)"
          value={description}
          onChange={e=>setDescription(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
          >
            Add site
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {sites.length === 0 && (
          <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
            No sites yet.
          </div>
        )}
        {sites.map(s => (
          <div key={s.id} className="bg-white border rounded-2xl p-4 flex justify-between gap-2">
            <div>
              <div className="font-semibold text-sm text-royal-700">{s.name}</div>
              {s.description && (
                <div className="text-xs text-gray-600 mt-1">{s.description}</div>
              )}
            </div>
            <button
              onClick={() => deleteSite(s.id)}
              className="px-3 py-1 rounded-xl border text-xs text-rose-600 hover:bg-rose-50"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
