import React, { useEffect, useState } from 'react'

type QuestionType = 'yesno' | 'rating' | 'multi' | 'text'

type Question = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
}

type Template = {
  id: string
  name: string
  site?: string
  questions: Question[]
}

type AnswerRow = {
  questionId: string
  label: string
  type: QuestionType
  options?: string[]
  answer: string
  note?: string
  photos?: string[]
}

type Inspection = {
  id: string
  templateId: string
  templateName: string
  site?: string
  startedAt: string
  completedAt?: string
  answers: AnswerRow[]
}

const TPL_KEY = 'ak_templates'
const INSP_KEY = 'ak_inspections'

const makeId = () =>
  (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2)

function normaliseQuestions(raw: any): Question[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (typeof raw[0] === 'string') {
    // old schema: strings only
    return raw.map((label: string) => ({
      id: makeId(),
      label,
      type: 'yesno' as QuestionType,
    }))
  }
  return raw.map((q: any, idx: number) => ({
    id: q.id || `q${idx + 1}`,
    label: q.label || String(q),
    type: (['yesno', 'rating', 'multi', 'text'] as QuestionType[]).includes(q.type)
      ? q.type
      : ('yesno' as QuestionType),
    options: Array.isArray(q.options) ? q.options : undefined,
  }))
}

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TPL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((t: any) => ({
      id: t.id || makeId(),
      name: t.name || 'Untitled',
      site: t.site || '',
      questions: normaliseQuestions(t.questions),
    }))
  } catch {
    return []
  }
}

function loadInspections(): Inspection[] {
  try {
    const raw = localStorage.getItem(INSP_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function saveInspections(list: Inspection[]) {
  localStorage.setItem(INSP_KEY, JSON.stringify(list))
}

export default function InspectionsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [active, setActive] = useState<Inspection | null>(null)

  useEffect(() => {
    setTemplates(loadTemplates())
    setInspections(loadInspections())
  }, [])

  useEffect(() => {
    saveInspections(inspections)
  }, [inspections])

  const startInspection = (tpl: Template) => {
    const answers: AnswerRow[] = tpl.questions.map(q => ({
      questionId: q.id,
      label: q.label,
      type: q.type,
      options: q.options,
      answer: '',
      note: '',
      photos: [],
    }))
    const insp: Inspection = {
      id: makeId(),
      templateId: tpl.id,
      templateName: tpl.name,
      site: tpl.site,
      startedAt: new Date().toISOString(),
      answers,
    }
    setActive(insp)
  }

  const setAnswer = (index: number, patch: Partial<AnswerRow>) => {
    if (!active) return
    const updated: Inspection = {
      ...active,
      answers: active.answers.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }
    setActive(updated)
  }

  const handlePhotoChange = (index: number, files: FileList | null) => {
    if (!files || files.length === 0 || !active) return
    const fileArray = Array.from(files)
    const readersDone: string[] = []
    let remaining = fileArray.length

    fileArray.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          readersDone.push(reader.result)
        }
        remaining -= 1
        if (remaining === 0) {
          const existing = active.answers[index].photos || []
          setAnswer(index, { photos: [...existing, ...readersDone] })
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const saveInspection = () => {
    if (!active) return
    const done: Inspection = {
      ...active,
      completedAt: new Date().toISOString(),
    }
    setInspections(prev => [done, ...prev])
    setActive(null)
  }

  const renderAnswerInput = (row: AnswerRow, index: number) => {
    if (row.type === 'yesno') {
      const choices = ['Yes', 'No', 'N/A']
      return (
        <div className="flex flex-wrap gap-2">
          {choices.map(choice => (
            <button
              key={choice}
              type="button"
              onClick={() => setAnswer(index, { answer: choice })}
              className={
                'px-3 py-1 rounded-xl border text-xs ' +
                (row.answer === choice
                  ? 'bg-royal-700 text-white'
                  : 'bg-white hover:bg-gray-50')
              }
            >
              {choice}
            </button>
          ))}
        </div>
      )
    }

    if (row.type === 'rating') {
      const options = row.options && row.options.length ? row.options : ['Good', 'Fair', 'Poor']
      return (
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setAnswer(index, { answer: opt })}
              className={
                'px-3 py-1 rounded-xl border text-xs ' +
                (row.answer === opt
                  ? 'bg-royal-700 text-white'
                  : 'bg-white hover:bg-gray-50')
              }
            >
              {opt}
            </button>
          ))}
        </div>
      )
    }

    if (row.type === 'multi') {
      const options = row.options || []
      return (
        <div className="flex flex-wrap gap-2">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setAnswer(index, { answer: opt })}
              className={
                'px-3 py-1 rounded-xl border text-xs ' +
                (row.answer === opt
                  ? 'bg-royal-700 text-white'
                  : 'bg-white hover:bg-gray-50')
              }
            >
              {opt}
            </button>
          ))}
          {options.length === 0 && (
            <span className="text-xs text-gray-400">
              No options defined for this question.
            </span>
          )}
        </div>
      )
    }

    // Free text
    return (
      <textarea
        className="w-full border rounded-xl px-3 py-1 text-sm"
        placeholder="Enter answer..."
        value={row.answer}
        onChange={e => setAnswer(index, { answer: e.target.value })}
      />
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-royal-700">Inspections</h1>
          <p className="text-sm text-gray-600">
            Run SafetyCulture-style inspections with buttons for responses, notes, and photos.
          </p>
        </div>
      </div>

      {!active && (
        <>
          <div className="bg-white border rounded-2xl p-4">
            <h2 className="font-semibold mb-2 text-royal-700">Start new inspection</h2>
            {templates.length === 0 && (
              <p className="text-sm text-gray-600">
                No templates available. Create one on the Templates page first.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => startInspection(t)}
                  className="px-3 py-2 rounded-xl border text-sm bg-white hover:bg-gray-50"
                >
                  {t.name}
                  {t.site ? ` — ${t.site}` : ''}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-gray-700">Past inspections</h2>
            {inspections.length === 0 && (
              <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
                No inspections yet.
              </div>
            )}
            {inspections.map(insp => (
              <div key={insp.id} className="bg-white border rounded-2xl p-4">
                <div className="flex justify-between text-sm">
                  <div>
                    <div className="font-semibold text-royal-700">{insp.templateName}</div>
                    {insp.site && <div className="text-xs text-gray-500">Site: {insp.site}</div>}
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    <div>Started: {insp.startedAt.slice(0, 16).replace('T', ' ')}</div>
                    {insp.completedAt && (
                      <div>Completed: {insp.completedAt.slice(0, 16).replace('T', ' ')}</div>
                    )}
                  </div>
                </div>
                <details className="mt-2 text-xs text-gray-600">
                  <summary className="cursor-pointer">Show answers</summary>
                  <ul className="mt-2 space-y-2">
                    {insp.answers.map((a, i) => (
                      <li key={i} className="border rounded-xl p-2">
                        <div className="font-semibold">
                          {i + 1}. {a.label}
                        </div>
                        <div>Answer: {a.answer || '—'}</div>
                        {a.note && <div>Note: {a.note}</div>}
                        {a.photos && a.photos.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {a.photos.map((src, idx) => (
                              <img
                                key={idx}
                                src={src}
                                alt="evidence"
                                className="h-12 w-12 object-cover rounded-md border"
                              />
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </>
      )}

      {active && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-royal-700">{active.templateName}</h2>
              {active.site && <div className="text-xs text-gray-500">Site: {active.site}</div>}
            </div>
            <button
              onClick={() => setActive(null)}
              className="text-sm px-3 py-1 rounded-xl border hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-3">
            {active.answers.map((row, index) => (
              <div key={row.questionId} className="border rounded-xl p-3 text-sm space-y-2">
                <div className="font-semibold">
                  {index + 1}. {row.label}
                </div>
                {renderAnswerInput(row, index)}
                <textarea
                  className="w-full border rounded-xl px-3 py-1 text-xs mt-2"
                  placeholder="Optional note"
                  value={row.note || ''}
                  onChange={e => setAnswer(index, { note: e.target.value })}
                />
                <div className="flex flex-col gap-1 mt-2">
                  <label className="text-xs text-gray-500">
                    Attach photos (stored in this browser only)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={e => handlePhotoChange(index, e.target.files)}
                    className="text-xs"
                  />
                  {row.photos && row.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {row.photos.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          alt="preview"
                          className="h-12 w-12 object-cover rounded-md border"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={saveInspection}
              className="px-4 py-2 rounded-xl bg-royal-700 text-white text-sm hover:bg-royal-800"
            >
              Complete inspection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
