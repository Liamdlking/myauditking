import React, { useEffect, useState } from 'react'

type Template = {
  id: string
  name: string
  description?: string
  site?: string
  questions: string[]
}

const LS_KEY = 'ak_templates'

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveTemplates(list: Template[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [site, setSite] = useState('')
  const [questions, setQuestions] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    setTemplates(loadTemplates())
  }, [])

  useEffect(() => {
    saveTemplates(templates)
  }, [templates])

  const resetForm = () => {
    setName('')
    setDescription('')
    setSite('')
    setQuestions('')
    setEditingId(null)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const qs = questions.split('\n').map(q => q.trim()).filter(Boolean)
    const t: Template = {
      id: editingId || crypto.randomUUID(),
      name,
      description,
      site,
      questions: qs
    }
    setTemplates(prev => {
      if (editingId) return prev.map(p => p.id === editingId ? t : p)
      return [t, ...prev]
    })
    resetForm()
  }

  const editTemplate = (t: Template) => {
    setEditingId(t.id)
    setName(t.name)
    setDescription(t.description || '')
    setSite(t.site || '')
    setQuestions(t.questions.join('\n'))
  }

  const deleteTemplate = (id: string) => {
    if (!confirm('Delete this template?')) return
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-royal-700">Templates</h1>
        <p className="text-sm text-gray-600">
          Create audit templates. Each line becomes a question.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-2xl border p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="Template name"
            value={name}
            onChange={e=>setName(e.target.value)}
            required
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="Site / location (optional)"
            value={site}
            onChange={e=>setSite(e.target.value)}
          />
        </div>
        <textarea
          className="border rounded-xl px-3 py-2 text-sm w-full"
          placeholder="Description (optional)"
          value={description}
          onChange={e=>setDescription(e.target.value)}
        />
        <textarea
          className="border rounded-xl px-3 py-2 text-sm w-full min-h-[120px]"
          placeholder="Questions (one per line)"
          value={questions}
          onChange={e=>setQuestions(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-2 rounded-xl border text-sm"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
          >
            {editingId ? 'Update template' : 'Create template'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
            No templates yet. Create one above.
          </div>
        )}
        {templates.map(t => (
          <div key={t.id} className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-3">
            <div>
              <div className="font-semibold text-royal-700">{t.name}</div>
              {t.site && <div className="text-xs text-gray-500">Site: {t.site}</div>}
              {t.description && <div className="text-sm text-gray-600 mt-1">{t.description}</div>}
              <div className="text-xs text-gray-500 mt-1">{t.questions.length} questions</div>
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => editTemplate(t)}
                className="px-3 py-1 rounded-xl border text-sm hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={() => deleteTemplate(t.id)}
                className="px-3 py-1 rounded-xl border text-sm text-rose-600 hover:bg-rose-50"
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
