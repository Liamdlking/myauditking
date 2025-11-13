import React, { useEffect, useState } from 'react'

type Template = {
  id: string
  name: string
  site?: string
  questions: string[]
}

type Inspection = {
  id: string
  templateId: string
  templateName: string
  site?: string
  startedAt: string
  completedAt?: string
  answers: { question: string; answer: string; note?: string }[]
}

const TPL_KEY = 'ak_templates'
const INSP_KEY = 'ak_inspections'

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TPL_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}
function loadInspections(): Inspection[] {
  try {
    const raw = localStorage.getItem(INSP_KEY)
    if (!raw) return []
    return JSON.parse(raw)
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
    const insp: Inspection = {
      id: crypto.randomUUID(),
      templateId: tpl.id,
      templateName: tpl.name,
      site: tpl.site,
      startedAt: new Date().toISOString(),
      answers: tpl.questions.map(q => ({ question: q, answer: '' }))
    }
    setActive(insp)
  }

  const updateAnswer = (index: number, field: 'answer'|'note', value: string) => {
    if (!active) return
    const updated = { ...active }
    const row = { ...updated.answers[index] }
    ;(row as any)[field] = value
    updated.answers = updated.answers.map((a, i) => i === index ? row : a)
    setActive(updated)
  }

  const saveInspection = () => {
    if (!active) return
    const done = { ...active, completedAt: new Date().toISOString() }
    setInspections(prev => [done, ...prev])
    setActive(null)
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-royal-700">Inspections</h1>
          <p className="text-sm text-gray-600">
            Start inspections from templates and keep a history.
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
                  {t.name}{t.site ? ` — ${t.site}` : ''}
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
                    <div>Started: {insp.startedAt.slice(0,16).replace('T',' ')}</div>
                    {insp.completedAt && <div>Completed: {insp.completedAt.slice(0,16).replace('T',' ')}</div>}
                  </div>
                </div>
                <details className="mt-2 text-xs text-gray-600">
                  <summary className="cursor-pointer">Show answers</summary>
                  <ul className="mt-2 space-y-1">
                    {insp.answers.map((a, i) => (
                      <li key={i}>
                        <span className="font-semibold">{i+1}. {a.question}</span>
                        <div>Answer: {a.answer || '—'}</div>
                        {a.note && <div>Note: {a.note}</div>}
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
            {active.answers.map((a, index) => (
              <div key={index} className="border rounded-xl p-3 text-sm space-y-2">
                <div className="font-semibold">{index+1}. {a.question}</div>
                <input
                  className="w-full border rounded-xl px-3 py-1 text-sm"
                  placeholder="Answer (e.g. Yes / No / Good / Poor)"
                  value={a.answer}
                  onChange={e=>updateAnswer(index, 'answer', e.target.value)}
                />
                <textarea
                  className="w-full border rounded-xl px-3 py-1 text-xs"
                  placeholder="Optional note"
                  value={a.note || ''}
                  onChange={e=>updateAnswer(index, 'note', e.target.value)}
                />
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
