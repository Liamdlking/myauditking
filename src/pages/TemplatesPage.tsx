import React, { useEffect, useState } from 'react'

type QuestionType = 'yesno' | 'rating' | 'multi' | 'text'

type Question = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
  /** local-only helper to keep what the user is typing, so commas work nicely */
  _optionsText?: string
}

type Template = {
  id: string
  name: string
  description?: string
  site?: string
  questions: Question[]
}

const LS_KEY = 'ak_templates'

const makeId = () =>
  (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2)

function normaliseQuestions(raw: any): Question[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  // Old schema: array of strings
  if (typeof raw[0] === 'string') {
    return raw.map((label: string) => ({
      id: makeId(),
      label,
      type: 'yesno' as QuestionType,
    }))
  }
  // New schema: objects
  return raw.map((q: any, idx: number) => ({
    id: q.id || `q${idx + 1}`,
    label: q.label || String(q),
    type: (['yesno', 'rating', 'multi', 'text'] as QuestionType[]).includes(q.type)
      ? q.type
      : ('yesno' as QuestionType),
    options: Array.isArray(q.options)
      ? q.options
      : typeof q.options === 'string'
      ? q.options
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined,
  }))
}

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((t: any) => ({
      id: t.id || makeId(),
      name: t.name || 'Untitled',
      description: t.description || '',
      site: t.site || '',
      questions: normaliseQuestions(t.questions),
    }))
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
  const [questions, setQuestions] = useState<Question[]>([])
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
    setQuestions([])
    setEditingId(null)
  }

  const addQuestion = (type: QuestionType) => {
    const base: Question = {
      id: makeId(),
      label: 'New question',
      type,
    }
    if (type === 'rating') {
      base.options = ['Good', 'Fair', 'Poor']
      base._optionsText = 'Good, Fair, Poor'
    }
    setQuestions(prev => [...prev, base])
  }

  const updateQuestion = (id: string, patch: Partial<Question>) => {
    setQuestions(prev =>
      prev.map(q => (q.id === id ? { ...q, ...patch } : q)),
    )
  }

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (questions.length === 0) {
      alert('Add at least one question.')
      return
    }

    const cleaned: Question[] = questions.map(q => {
      const { _optionsText, ...rest } = q as any
      const label = (q.label || '').trim() || 'Untitled question'
      const options =
        q.type === 'multi' || q.type === 'rating'
          ? (q.options || [])
              .map(opt => opt.trim())
              .filter(Boolean)
          : undefined
      return {
        ...rest,
        label,
        options,
      }
    })

    const tpl: Template = {
      id: editingId || makeId(),
      name: name.trim(),
      description: description.trim() || '',
      site: site.trim() || '',
      questions: cleaned,
    }

    setTemplates(prev => {
      if (editingId) {
        return prev.map(p => (p.id === editingId ? tpl : p))
      }
      return [tpl, ...prev]
    })

    resetForm()
  }

  const editTemplate = (t: Template) => {
    setEditingId(t.id)
    setName(t.name)
    setDescription(t.description || '')
    setSite(t.site || '')
    setQuestions(
      t.questions.map(q => {
        const opts =
          q.options && q.options.length
            ? [...q.options]
            : q.type === 'rating'
            ? ['Good', 'Fair', 'Poor']
            : []
        return {
          ...q,
          options: opts,
          _optionsText: opts.join(', '),
        }
      }),
    )
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
          Build SafetyCulture-style templates with Yes/No/N/A, Good/Fair/Poor, multiple choice and
          text questions.
        </p>
      </div>

      {/* Template form */}
      <form onSubmit={onSubmit} className="bg-white rounded-2xl border p-4 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="Template name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <input
            className="border rounded-xl px-3 py-2 text-sm"
            placeholder="Site / location (optional)"
            value={site}
            onChange={e => setSite(e.target.value)}
          />
        </div>
        <textarea
          className="border rounded-xl px-3 py-2 text-sm w-full"
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        {/* Question builder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Questions</span>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => addQuestion('yesno')}
                className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
              >
                + Yes / No / N/A
              </button>
              <button
                type="button"
                onClick={() => addQuestion('rating')}
                className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
              >
                + Good / Fair / Poor
              </button>
              <button
                type="button"
                onClick={() => addQuestion('multi')}
                className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
              >
                + Multiple choice
              </button>
              <button
                type="button"
                onClick={() => addQuestion('text')}
                className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
              >
                + Free text
              </button>
            </div>
          </div>

          {questions.length === 0 && (
            <div className="text-xs text-gray-500 border rounded-xl p-3">
              No questions yet. Use the buttons above to add some.
            </div>
          )}

          <div className="space-y-2">
            {questions.map((q, index) => (
              <div
                key={q.id}
                className="border rounded-xl p-3 text-sm flex flex-col gap-2 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Q{index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeQuestion(q.id)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <input
                  className="border rounded-xl px-3 py-1 text-sm w-full"
                  value={q.label}
                  onChange={e => updateQuestion(q.id, { label: e.target.value })}
                  placeholder="Question text"
                />
                <div className="grid md:grid-cols-2 gap-2 items-center">
                  <select
                    className="border rounded-xl px-3 py-1 text-xs"
                    value={q.type}
                    onChange={e =>
                      updateQuestion(q.id, {
                        type: e.target.value as QuestionType,
                      })
                    }
                  >
                    <option value="yesno">Yes / No / N/A</option>
                    <option value="rating">Good / Fair / Poor</option>
                    <option value="multi">Multiple choice</option>
                    <option value="text">Free text</option>
                  </select>

                  {(q.type === 'multi' || q.type === 'rating') && (
                    <input
                      className="border rounded-xl px-3 py-1 text-xs"
                      placeholder={
                        q.type === 'rating'
                          ? 'Options (comma separated: Good, Fair, Poor)'
                          : 'Options (comma separated)'
                      }
                      value={q._optionsText ?? (q.options || []).join(', ')}
                      onChange={e => {
                        const text = e.target.value
                        updateQuestion(q.id, {
                          _optionsText: text,
                          options: text
                            .split(',')
                            .map(s => s.trim())
                            .filter(Boolean),
                        })
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

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

      {/* Template list */}
      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
            No templates yet. Create your first one above.
          </div>
        )}
        {templates.map(t => (
          <div
            key={t.id}
            className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-3"
          >
            <div>
              <div className="font-semibold text-royal-700">{t.name}</div>
              {t.site && <div className="text-xs text-gray-500">Site: {t.site}</div>}
              {t.description && <div className="text-sm text-gray-600 mt-1">{t.description}</div>}
              <div className="text-xs text-gray-500 mt-1">
                {t.questions.length} question{t.questions.length === 1 ? '' : 's'}
              </div>
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