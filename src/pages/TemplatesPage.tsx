import React, { useEffect, useState } from 'react'
import { supabase } from '@/utils/supabaseClient'

// Reuse the same core types
type QuestionType = 'yesno' | 'rating' | 'multi' | 'text'

type Question = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
  instruction?: string
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
  site?: string
  logoDataUrl?: string
  sections: TemplateSection[]
}

const makeId = () =>
  (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2)

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Template | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  // Editor state
  const [name, setName] = useState('')
  const [site, setSite] = useState('')
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined)
  const [sections, setSections] = useState<TemplateSection[]>([])

  const resetEditor = () => {
    setEditing(null)
    setName('')
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
  }

  const openNewTemplate = () => {
    resetEditor()
    setShowEditor(true)
  }

  const openExistingTemplate = (tpl: Template) => {
    setEditing(tpl)
    setName(tpl.name)
    setSite(tpl.site || '')
    setLogoDataUrl(tpl.logoDataUrl)
    setSections(
      (tpl.sections || []).map(sec => ({
        ...sec,
        questions: (sec.questions || []).map(q => ({ ...q })),
      })),
    )
    setShowEditor(true)
  }

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('id, name, site, logo_data_url, definition')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('load templates error', error)
        setTemplates([])
        return
      }

      const mapped: Template[] =
        data?.map((row: any) => {
          const def = row.definition || {}
          const sectionsRaw = Array.isArray(def.sections) ? def.sections : []
          let sections: TemplateSection[]

          if (sectionsRaw.length > 0) {
            sections = sectionsRaw.map((s: any, idx: number) => ({
              id: s.id || `sec-${idx + 1}`,
              title: s.title || `Section ${idx + 1}`,
              headerImageDataUrl: s.headerImageDataUrl || undefined,
              questions: Array.isArray(s.questions)
                ? s.questions.map((q: any, qIdx: number) => ({
                    id: q.id || `q${qIdx + 1}`,
                    label: q.label || `Question ${qIdx + 1}`,
                    type: (['yesno', 'rating', 'multi', 'text'] as QuestionType[]).includes(
                      q.type,
                    )
                      ? q.type
                      : ('yesno' as QuestionType),
                    options: Array.isArray(q.options) ? q.options : undefined,
                    instruction:
                      typeof q.instruction === 'string' ? q.instruction : undefined,
                    refImages: Array.isArray(q.refImages) ? q.refImages : undefined,
                  }))
                : [],
            }))
          } else {
            // Fallback if old definition
            const flatQs = Array.isArray(def.questions) ? def.questions : []
            sections = [
              {
                id: makeId(),
                title: 'General',
                headerImageDataUrl: undefined,
                questions: flatQs.map((q: any, idx: number) => ({
                  id: q.id || `q${idx + 1}`,
                  label: q.label || `Question ${idx + 1}`,
                  type: (['yesno', 'rating', 'multi', 'text'] as QuestionType[]).includes(
                    q.type,
                  )
                    ? q.type
                    : ('yesno' as QuestionType),
                  options: Array.isArray(q.options) ? q.options : undefined,
                  instruction:
                    typeof q.instruction === 'string' ? q.instruction : undefined,
                  refImages: Array.isArray(q.refImages) ? q.refImages : undefined,
                })),
              },
            ]
          }

          return {
            id: row.id,
            name: row.name || 'Untitled',
            site: row.site || '',
            logoDataUrl: row.logo_data_url || undefined,
            sections,
          } as Template
        }) || []

      setTemplates(mapped)
    } catch (err) {
      console.error('loadTemplates error', err)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleLogoChange = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleHeaderImageChange = (secId: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const file = fileList[0]
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSections(prev =>
          prev.map(sec =>
            sec.id === secId ? { ...sec, headerImageDataUrl: reader.result as string } : sec,
          ),
        )
      }
    }
    reader.readAsDataURL(file)
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

  const removeSection = (secId: string) => {
    if (!confirm('Remove this section and its questions?')) return
    setSections(prev => prev.filter(s => s.id !== secId))
  }

  const addQuestion = (secId: string, type: QuestionType) => {
    setSections(prev =>
      prev.map(sec =>
        sec.id === secId
          ? {
              ...sec,
              questions: [
                ...sec.questions,
                {
                  id: makeId(),
                  label: 'New question',
                  type,
                  options:
                    type === 'rating'
                      ? ['Good', 'Fair', 'Poor']
                      : type === 'multi'
                      ? ['Option 1', 'Option 2']
                      : undefined,
                },
              ],
            }
          : sec,
      ),
    )
  }

  const handleQuestionChange = (
    secId: string,
    qId: string,
    patch: Partial<Question>,
  ) => {
    setSections(prev =>
      prev.map(sec =>
        sec.id === secId
          ? {
              ...sec,
              questions: sec.questions.map(q =>
                q.id === qId
                  ? {
                      ...q,
                      ...patch,
                      // handle options string specially if passed as any
                    }
                  : q,
              ),
            }
          : sec,
      ),
    )
  }

  const handleQuestionOptionsChange = (
    secId: string,
    qId: string,
    optionsStr: string,
  ) => {
    const arr = optionsStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    handleQuestionChange(secId, qId, { options: arr })
  }

  const removeQuestion = (secId: string, qId: string) => {
    setSections(prev =>
      prev.map(sec =>
        sec.id === secId
          ? { ...sec, questions: sec.questions.filter(q => q.id !== qId) }
          : sec,
      ),
    )
  }

  const handleQuestionRefImage = (secId: string, qId: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSections(prev =>
          prev.map(sec =>
            sec.id === secId
              ? {
                  ...sec,
                  questions: sec.questions.map(q =>
                    q.id === qId
                      ? {
                          ...q,
                          refImages: [...(q.refImages || []), reader.result as string],
                        }
                      : q,
                  ),
                }
              : sec,
          ),
        )
      }
    }
    reader.readAsDataURL(file)
  }

  const saveTemplate = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      alert('Template name is required.')
      return
    }

    // Build definition JSON
    const definition = {
      sections: sections.map(sec => ({
        id: sec.id,
        title: sec.title,
        headerImageDataUrl: sec.headerImageDataUrl || null,
        questions: sec.questions.map(q => ({
          id: q.id,
          label: q.label,
          type: q.type,
          options: q.options || null,
          instruction: q.instruction || null,
          refImages: q.refImages || null,
        })),
      })),
    }

    try {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id ?? null

      if (editing) {
        const { error } = await supabase
          .from('templates')
          .update({
            name: trimmedName,
            site: site.trim() || null,
            logo_data_url: logoDataUrl || null,
            definition,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editing.id)

        if (error) {
          console.error('update template error', error)
          alert(`Could not save template: ${error.message}`)
          return
        }
      } else {
        const { error } = await supabase.from('templates').insert({
          name: trimmedName,
          site: site.trim() || null,
          logo_data_url: logoDataUrl || null,
          definition,
          created_by: uid,
        })

        if (error) {
          console.error('insert template error', error)
          alert(`Could not create template: ${error.message}`)
          return
        }
      }

      setShowEditor(false)
      await loadTemplates()
    } catch (err) {
      console.error('saveTemplate error', err)
      alert('Could not save template.')
    }
  }

  const deleteTemplate = async (tpl: Template) => {
    if (!confirm(`Delete template "${tpl.name}"? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('templates').delete().eq('id', tpl.id)
      if (error) {
        console.error('delete template error', error)
        alert(`Could not delete template: ${error.message}`)
        return
      }
      await loadTemplates()
    } catch (err) {
      console.error('deleteTemplate error', err)
      alert('Could not delete template.')
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-royal-700">Templates</h1>
          <p className="text-sm text-gray-600">
            Shared inspection templates with sections, images, instructions and logos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openNewTemplate}
            className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
          >
            New template
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading templates…</div>}

      {!loading && templates.length === 0 && (
        <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
          No templates yet. Click <strong>New template</strong> to create one.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {templates.map(tpl => (
          <div
            key={tpl.id}
            className="bg-white border rounded-2xl p-4 flex flex-col justify-between gap-3"
          >
            <div className="flex gap-3">
              {tpl.logoDataUrl && (
                <img
                  src={tpl.logoDataUrl}
                  alt="logo"
                  className="w-10 h-10 rounded-full object-cover border"
                />
              )}
              <div>
                <div className="font-semibold text-royal-700">{tpl.name}</div>
                {tpl.site && (
                  <div className="text-xs text-gray-500">Site: {tpl.site}</div>
                )}
                <div className="text-xs text-gray-500">
                  Sections: {tpl.sections.length}, Questions:{' '}
                  {tpl.sections.reduce((acc, s) => acc + s.questions.length, 0)}
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <button
                onClick={() => openExistingTemplate(tpl)}
                className="px-3 py-1 rounded-xl border hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={() => deleteTemplate(tpl)}
                className="px-3 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Editor modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-auto p-4 md:p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div className="font-semibold text-lg text-royal-700">
                {editing ? 'Edit template' : 'New template'}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-3 py-1 text-sm rounded-xl border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTemplate}
                  className="px-3 py-1 text-sm rounded-xl bg-royal-700 text-white hover:bg-royal-800"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Basic info */}
            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-600">Template name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                    placeholder="e.g. Warehouse Daily Safety Walk"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Site (optional)</label>
                  <input
                    value={site}
                    onChange={e => setSite(e.target.value)}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                    placeholder="e.g. Manchester DC"
                  />
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                <div>
                  <label className="text-xs text-gray-600">Template logo</label>
                  <div className="flex items-center gap-3 mt-1">
                    {logoDataUrl && (
                      <img
                        src={logoDataUrl}
                        alt="logo"
                        className="w-10 h-10 rounded-full object-cover border"
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleLogoChange(e.target.files)}
                      className="text-xs"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Logo helps users quickly identify this template on mobile/desktop.
                </p>
              </div>
            </div>

            {/* Sections + questions */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="font-semibold text-sm text-gray-800">
                  Sections &amp; questions
                </div>
                <button
                  type="button"
                  onClick={addSection}
                  className="px-3 py-1 text-xs rounded-xl border hover:bg-gray-50"
                >
                  Add section
                </button>
              </div>

              <div className="space-y-3">
                {sections.map(sec => (
                  <div key={sec.id} className="border rounded-2xl p-3 space-y-3 bg-white">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-gray-600">Section title</label>
                        <input
                          value={sec.title}
                          onChange={e =>
                            setSections(prev =>
                              prev.map(s =>
                                s.id === sec.id ? { ...s, title: e.target.value } : s,
                              ),
                            )
                          }
                          className="w-full border rounded-xl px-3 py-1 text-sm"
                          placeholder="e.g. PPE, Fire Safety, Housekeeping"
                        />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <label className="text-xs text-gray-600">Header image</label>
                        <div className="flex items-center gap-2">
                          {sec.headerImageDataUrl && (
                            <img
                              src={sec.headerImageDataUrl}
                              alt="header"
                              className="w-10 h-10 rounded-lg object-cover border"
                            />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e =>
                              handleHeaderImageChange(sec.id, e.target.files)
                            }
                            className="text-xs"
                          />
                        </div>
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSection(sec.id)}
                            className="text-[11px] text-rose-600 hover:underline mt-1"
                          >
                            Remove section
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Questions in section */}
                    <div className="space-y-2">
                      {sec.questions.map(q => (
                        <div
                          key={q.id}
                          className="border rounded-xl p-2 text-xs md:text-sm space-y-2"
                        >
                          <div className="flex flex-col md:flex-row gap-2">
                            <div className="flex-1">
                              <label className="text-[11px] text-gray-600">
                                Question text
                              </label>
                              <input
                                value={q.label}
                                onChange={e =>
                                  handleQuestionChange(sec.id, q.id, {
                                    label: e.target.value,
                                  })
                                }
                                className="w-full border rounded-xl px-2 py-1 text-xs md:text-sm"
                                placeholder="e.g. Are walkways clear of obstructions?"
                              />
                            </div>
                            <div className="w-full md:w-40">
                              <label className="text-[11px] text-gray-600">
                                Answer type
                              </label>
                              <select
                                value={q.type}
                                onChange={e =>
                                  handleQuestionChange(sec.id, q.id, {
                                    type: e.target.value as QuestionType,
                                  })
                                }
                                className="w-full border rounded-xl px-2 py-1 text-xs"
                              >
                                <option value="yesno">Yes / No / N/A</option>
                                <option value="rating">Rating (Good/Fair/Poor)</option>
                                <option value="multi">Multiple choice</option>
                                <option value="text">Text only</option>
                              </select>
                            </div>
                          </div>

                          {(q.type === 'rating' || q.type === 'multi') && (
                            <div>
                              <label className="text-[11px] text-gray-600">
                                Options (comma separated)
                              </label>
                              <input
                                value={(q.options || []).join(', ')}
                                onChange={e =>
                                  handleQuestionOptionsChange(
                                    sec.id,
                                    q.id,
                                    e.target.value,
                                  )
                                }
                                className="w-full border rounded-xl px-2 py-1 text-xs"
                                placeholder={
                                  q.type === 'rating'
                                    ? 'e.g. Good, Fair, Poor'
                                    : 'e.g. Red, Amber, Green'
                                }
                              />
                            </div>
                          )}

                          <div>
                            <label className="text-[11px] text-gray-600">
                              Inspector instructions (optional)
                            </label>
                            <textarea
                              value={q.instruction || ''}
                              onChange={e =>
                                handleQuestionChange(sec.id, q.id, {
                                  instruction: e.target.value,
                                })
                              }
                              className="w-full border rounded-xl px-2 py-1 text-xs"
                              placeholder="Explain what to look for, acceptable standards, etc."
                            />
                          </div>

                          <div className="flex flex-col md:flex-row gap-2 md:items-center">
                            <div>
                              <label className="text-[11px] text-gray-600">
                                Reference image (optional)
                              </label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={e =>
                                  handleQuestionRefImage(sec.id, q.id, e.target.files)
                                }
                                className="text-xs"
                              />
                            </div>
                            {q.refImages && q.refImages.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {q.refImages.map((src, idx) => (
                                  <img
                                    key={idx}
                                    src={src}
                                    alt="reference"
                                    className="h-10 w-10 object-cover rounded-md border"
                                  />
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeQuestion(sec.id, q.id)}
                              className="text-[11px] text-rose-600 hover:underline"
                            >
                              Remove question
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => addQuestion(sec.id, 'yesno')}
                          className="px-2 py-1 rounded-xl border text-[11px] hover:bg-gray-50"
                        >
                          + Yes/No/N/A
                        </button>
                        <button
                          type="button"
                          onClick={() => addQuestion(sec.id, 'rating')}
                          className="px-2 py-1 rounded-xl border text-[11px] hover:bg-gray-50"
                        >
                          + Rating
                        </button>
                        <button
                          type="button"
                          onClick={() => addQuestion(sec.id, 'multi')}
                          className="px-2 py-1 rounded-xl border text-[11px] hover:bg-gray-50"
                        >
                          + Multiple choice
                        </button>
                        <button
                          type="button"
                          onClick={() => addQuestion(sec.id, 'text')}
                          className="px-2 py-1 rounded-xl border text-[11px] hover:bg-gray-50"
                        >
                          + Text
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-gray-500">
                Inspectors will see sections with headers, reference images, and the answer
                widgets you’ve configured — similar to SafetyCulture.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
