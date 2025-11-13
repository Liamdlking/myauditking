import React, { useEffect, useState } from 'react'

type QuestionType = 'yesno' | 'rating' | 'multi' | 'text'

type Question = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
  /** local-only helper to keep what the user is typing, so commas work nicely */
  _optionsText?: string
  /** guidance text shown to inspectors when they run an inspection */
  instruction?: string
  /** reference images shown to inspectors */
  refImages?: string[]
}

type TemplateSection = {
  id: string
  title: string
  headerImageDataUrl?: string
  questions: Question[]
}

type Template = {
  id: string
  name: string
  description?: string
  site?: string
  /** logo for this template, shown in list & passed to inspections */
  logoDataUrl?: string
  sections: TemplateSection[]
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
  // Newer schema: objects
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
    instruction: typeof q.instruction === 'string' ? q.instruction : undefined,
    refImages: Array.isArray(q.refImages) ? q.refImages : undefined,
  }))
}

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.map((t: any) => {
      // Newer schema already has sections
      if (Array.isArray(t.sections) && t.sections.length > 0) {
        return {
          id: t.id || makeId(),
          name: t.name || 'Untitled',
          description: t.description || '',
          site: t.site || '',
          logoDataUrl: t.logoDataUrl || undefined,
          sections: t.sections.map((s: any, idx: number) => ({
            id: s.id || `sec-${idx + 1}`,
            title: s.title || `Section ${idx + 1}`,
            headerImageDataUrl: s.headerImageDataUrl || undefined,
            questions: normaliseQuestions(s.questions),
          })),
        } as Template
      }

      // Older schema: flat questions on root
      const flatQuestions = normaliseQuestions(t.questions)
      const defaultSection: TemplateSection = {
        id: makeId(),
        title: 'General',
        headerImageDataUrl: undefined,
        questions: flatQuestions,
      }

      return {
        id: t.id || makeId(),
        name: t.name || 'Untitled',
        description: t.description || '',
        site: t.site || '',
        logoDataUrl: t.logoDataUrl || undefined,
        sections: [defaultSection],
      } as Template
    })
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
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined)
  const [sections, setSections] = useState<TemplateSection[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const loaded = loadTemplates()
    setTemplates(loaded)
    // default for new template form
    if (!editingId && sections.length === 0) {
      setSections([
        {
          id: makeId(),
          title: 'General',
          headerImageDataUrl: undefined,
          questions: [],
        },
      ])
    }
  }, [])

  useEffect(() => {
    saveTemplates(templates)
  }, [templates])

  const resetForm = () => {
    setName('')
    setDescription('')
    setSite('')
    setLogoDataUrl(undefined)
    setSections([
      {
        id: makeId(),
        title: 'General',
        headerImageDataUrl: undefined,
        questions: [],
      },
    ])
    setEditingId(null)
  }

  const addSection = () => {
    setSections(prev => [
      ...prev,
      {
        id: makeId(),
        title: `Section ${prev.length + 1}`,
        headerImageDataUrl: undefined,
        questions: [],
      },
    ])
  }

  const updateSection = (sectionId: string, patch: Partial<TemplateSection>) => {
    setSections(prev =>
      prev.map(s => (s.id === sectionId ? { ...s, ...patch } : s)),
    )
  }

  const handleSectionHeaderUpload = (sectionId: string, file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateSection(sectionId, { headerImageDataUrl: reader.result })
      }
    }
    reader.readAsDataURL(file)
  }

  const removeSectionHeaderImage = (sectionId: string) => {
    updateSection(sectionId, { headerImageDataUrl: undefined })
  }

  const removeSection = (sectionId: string) => {
    setSections(prev => {
      const next = prev.filter(s => s.id !== sectionId)
      if (next.length === 0) {
        return [
          {
            id: makeId(),
            title: 'General',
            headerImageDataUrl: undefined,
            questions: [],
          },
        ]
      }
      return next
    })
  }

  const addQuestion = (sectionId: string, type: QuestionType) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s
        const base: Question = {
          id: makeId(),
          label: 'New question',
          type,
        }
        if (type === 'rating') {
          base.options = ['Good', 'Fair', 'Poor']
          base._optionsText = 'Good, Fair, Poor'
        }
        return {
          ...s,
          questions: [...s.questions, base],
        }
      }),
    )
  }

  const updateQuestion = (sectionId: string, questionId: string, patch: Partial<Question>) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s
        return {
          ...s,
          questions: s.questions.map(q => (q.id === questionId ? { ...q, ...patch } : q)),
        }
      }),
    )
  }

  const removeQuestion = (sectionId: string, questionId: string) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s
        return {
          ...s,
          questions: s.questions.filter(q => q.id !== questionId),
        }
      }),
    )
  }

  const addRefImages = (sectionId: string, questionId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    const arr = Array.from(files)
    const results: string[] = []
    let remaining = arr.length

    arr.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          results.push(reader.result)
        }
        remaining -= 1
        if (remaining === 0) {
          setSections(prev =>
            prev.map(s => {
              if (s.id !== sectionId) return s
              return {
                ...s,
                questions: s.questions.map(q => {
                  if (q.id !== questionId) return q
                  const existing = q.refImages || []
                  return { ...q, refImages: [...existing, ...results] }
                }),
              }
            }),
          )
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const removeRefImage = (sectionId: string, questionId: string, index: number) => {
    setSections(prev =>
      prev.map(s => {
        if (s.id !== sectionId) return s
        return {
          ...s,
          questions: s.questions.map(q => {
            if (q.id !== questionId) return q
            const list = [...(q.refImages || [])]
            list.splice(index, 1)
            return { ...q, refImages: list }
          }),
        }
      }),
    )
  }

  const handleLogoUpload = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const totalQuestions = sections.reduce(
      (acc, s) => acc + (s.questions ? s.questions.length : 0),
      0,
    )
    if (totalQuestions === 0) {
      alert('Add at least one question.')
      return
    }

    const cleanedSections: TemplateSection[] = sections.map(sec => {
      const cleanedQuestions: Question[] = sec.questions.map(q => {
        const { _optionsText, ...rest } = q as any
        const label = (q.label || '').trim() || 'Untitled question'
        const options =
          q.type === 'multi' || q.type === 'rating'
            ? (q.options || [])
                .map(opt => opt.trim())
                .filter(Boolean)
            : undefined
        const instruction =
          typeof q.instruction === 'string' && q.instruction.trim()
            ? q.instruction.trim()
            : undefined
        const refImages = q.refImages && q.refImages.length ? q.refImages : undefined

        return {
          ...rest,
          label,
          options,
          instruction,
          refImages,
        }
      })

      return {
        id: sec.id || makeId(),
        title: sec.title.trim() || 'Section',
        headerImageDataUrl: sec.headerImageDataUrl,
        questions: cleanedQuestions,
      }
    })

    const tpl: Template = {
      id: editingId || makeId(),
      name: name.trim(),
      description: description.trim() || '',
      site: site.trim() || '',
      logoDataUrl,
      sections: cleanedSections,
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
    setLogoDataUrl(t.logoDataUrl)
    setSections(
      (t.sections && t.sections.length ? t.sections : []).map(sec => ({
        id: sec.id || makeId(),
        title: sec.title || 'Section',
        headerImageDataUrl: sec.headerImageDataUrl || undefined,
        questions: (sec.questions || []).map(q => {
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
            refImages: q.refImages || [],
            instruction: q.instruction || '',
          }
        }),
      })),
    )
    if (!t.sections || t.sections.length === 0) {
      // fallback if somehow old template
      setSections([
        {
          id: makeId(),
          title: 'General',
          headerImageDataUrl: undefined,
          questions: [],
        },
      ])
    }
  }

  const deleteTemplate = (id: string) => {
    if (!confirm('Delete this template?')) return
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const totalQuestions = sections.reduce(
    (acc, s) => acc + (s.questions ? s.questions.length : 0),
    0,
  )

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-royal-700">Templates</h1>
        <p className="text-sm text-gray-600">
          Build SafetyCulture-style templates with sections, logos, reference images and guidance.
        </p>
      </div>

      {/* Template form */}
      <form onSubmit={onSubmit} className="bg-white rounded-2xl border p-4 space-y-4">
        <div className="grid md:grid-cols-[minmax(0,1fr)_180px] gap-4 items-start">
          <div className="space-y-3">
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
          </div>
          {/* Template logo */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-700">Template logo</div>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border bg-gray-50 flex items-center justify-center overflow-hidden text-[10px] text-gray-400">
                {logoDataUrl ? (
                  <img
                    src={logoDataUrl}
                    alt="Template logo"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  'Logo'
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleLogoUpload(e.target.files?.[0] || null)}
                  className="text-xs"
                />
                {logoDataUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoDataUrl(undefined)}
                    className="text-[11px] text-gray-500 hover:underline"
                  >
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sections + questions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              Sections & questions ({totalQuestions} total)
            </span>
            <button
              type="button"
              onClick={addSection}
              className="px-3 py-1 rounded-xl border text-xs bg-white hover:bg-gray-50"
            >
              + Add section
            </button>
          </div>

          {sections.map((sec, secIndex) => (
            <div key={sec.id} className="border rounded-2xl p-3 bg-gray-50 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-gray-500">Section {secIndex + 1}</div>
                  </div>
                  <input
                    className="border rounded-xl px-3 py-1 text-sm w-full"
                    placeholder="Section header (e.g. PPE, Housekeeping, Fire Safety)"
                    value={sec.title}
                    onChange={e => updateSection(sec.id, { title: e.target.value })}
                  />
                </div>
                <div className="w-28 space-y-1">
                  <div className="text-[11px] text-gray-500">Header image</div>
                  <div className="w-full h-14 rounded-xl border bg-white flex items-center justify-center overflow-hidden text-[10px] text-gray-400">
                    {sec.headerImageDataUrl ? (
                      <img
                        src={sec.headerImageDataUrl}
                        alt="Section header"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      'Section image'
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e =>
                      handleSectionHeaderUpload(sec.id, e.target.files?.[0] || null)
                    }
                    className="text-[11px]"
                  />
                  {sec.headerImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => removeSectionHeaderImage(sec.id)}
                      className="text-[10px] text-gray-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Section question toolbar */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  {sec.questions.length} question
                  {sec.questions.length === 1 ? '' : 's'} in this section
                </span>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => addQuestion(sec.id, 'yesno')}
                    className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    + Yes / No / N/A
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestion(sec.id, 'rating')}
                    className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    + Good / Fair / Poor
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestion(sec.id, 'multi')}
                    className="px-3 py-1 rounded-xl border bg白 hover:bg-gray-50"
                  >
                    + Multiple choice
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestion(sec.id, 'text')}
                    className="px-3 py-1 rounded-xl border bg-white hover:bg-gray-50"
                  >
                    + Free text
                  </button>
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSection(sec.id)}
                      className="px-3 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
                    >
                      Remove section
                    </button>
                  )}
                </div>
              </div>

              {/* Questions in this section */}
              {sec.questions.length === 0 && (
                <div className="text-[11px] text-gray-500 border rounded-xl p-2 bg-white">
                  No questions in this section yet.
                </div>
              )}

              <div className="space-y-2">
                {sec.questions.map((q, index) => (
                  <div
                    key={q.id}
                    className="border rounded-xl p-3 text-sm flex flex-col gap-2 bg-white"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        Q{index + 1} in {sec.title || 'Section'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeQuestion(sec.id, q.id)}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      className="border rounded-xl px-3 py-1 text-sm w-full"
                      value={q.label}
                      onChange={e =>
                        updateQuestion(sec.id, q.id, { label: e.target.value })
                      }
                      placeholder="Question text"
                    />
                    <div className="grid md:grid-cols-2 gap-2 items-center">
                      <select
                        className="border rounded-xl px-3 py-1 text-xs"
                        value={q.type}
                        onChange={e =>
                          updateQuestion(sec.id, q.id, {
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
                            updateQuestion(sec.id, q.id, {
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

                    {/* Inspector instructions */}
                    <textarea
                      className="border rounded-xl px-3 py-1 text-xs w-full"
                      placeholder="Inspector instructions (optional) – e.g. what to look for, standards, examples."
                      value={q.instruction || ''}
                      onChange={e =>
                        updateQuestion(sec.id, q.id, { instruction: e.target.value })
                      }
                    />

                    {/* Reference images */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-gray-500">
                        Reference images (optional) – shown to inspectors while answering
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={e =>
                          addRefImages(sec.id, q.id, e.target.files)
                        }
                        className="text-xs"
                      />
                      {q.refImages && q.refImages.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {q.refImages.map((src, idx) => (
                            <div key={idx} className="relative">
                              <img
                                src={src}
                                alt="reference"
                                className="h-12 w-12 object-cover rounded-md border"
                              />
                              <button
                                type="button"
                                onClick={() => removeRefImage(sec.id, q.id, idx)}
                                className="absolute -top-1 -right-1 bg-white/80 rounded-full border text-[9px] px-1 leading-none"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
        {templates.map(t => {
          const count =
            t.sections?.reduce(
              (acc, s) => acc + (s.questions ? s.questions.length : 0),
              0,
            ) ?? 0

          return (
            <div
              key={t.id}
              className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-3"
            >
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl border bg-gray-50 flex items-center justify-center overflow-hidden text-[10px] text-gray-400 flex-shrink-0">
                  {t.logoDataUrl ? (
                    <img
                      src={t.logoDataUrl}
                      alt="Template logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    t.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-semibold text-royal-700">{t.name}</div>
                  {t.site && <div className="text-xs text-gray-500">Site: {t.site}</div>}
                  {t.description && (
                    <div className="text-sm text-gray-600 mt-1">{t.description}</div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {t.sections?.length ?? 0} section
                    {(t.sections?.length ?? 0) === 1 ? '' : 's'} • {count} question
                    {count === 1 ? '' : 's'}
                  </div>
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
          )
        })}
      </div>
    </div>
  )
}