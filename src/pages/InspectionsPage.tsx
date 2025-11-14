import React, { useEffect, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

type AnswerRow = {
  id: string
  label: string
  type: 'yesno' | 'rating' | 'multi' | 'text'
  options?: string[]
  answer: string
  note?: string
  photo?: string
  section?: string
}

type Template = {
  id: string
  name: string
  description?: string
  site?: string
  sections?: {
    id: string
    title: string
    image?: string
  }[]
  questions: AnswerRow[]
}

const LS_TEMPLATES = 'ak_templates'
const LS_INSPECTIONS = 'ak_inspections'

const makeId = () =>
  (crypto as any)?.randomUUID?.() ?? Math.random().toString(36).slice(2)

export default function InspectionsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [inProgress, setInProgress] = useState<any[]>([])
  const [completed, setCompleted] = useState<any[]>([])
  const [active, setActive] = useState<any | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TEMPLATES)
      if (raw) {
        const parsed = JSON.parse(raw)
        setTemplates(parsed)
      }
    } catch {}

    try {
      const raw2 = localStorage.getItem(LS_INSPECTIONS)
      if (raw2) {
        const parsed2 = JSON.parse(raw2)
        setInProgress(parsed2.filter((i: any) => !i.completedAt))
        setCompleted(parsed2.filter((i: any) => i.completedAt))
      }
    } catch {}
  }, [])

  const saveInspectionStore = (list: any[]) => {
    localStorage.setItem(LS_INSPECTIONS, JSON.stringify(list))
  }

  const startInspection = (tpl: Template) => {
    const rows = tpl.questions.map(q => ({
      ...q,
      answer: '',
      note: '',
      photo: '',
    }))

    const record = {
      id: makeId(),
      templateId: tpl.id,
      templateName: tpl.name,
      startedAt: Date.now(),
      completedAt: null,
      answers: rows,
    }

    const updated = [record, ...inProgress]
    setInProgress(updated)

    const everything = [...updated, ...completed]
    saveInspectionStore(everything)

    setActive(record)
  }

  const loadInspection = (insp: any) => {
    setActive(insp)
  }

  const setAnswer = (rowIndex: number, patch: any) => {
    if (!active) return

    const updatedRows = active.answers.map((r: any, i: number) =>
      i === rowIndex ? { ...r, ...patch } : r,
    )

    const updated = { ...active, answers: updatedRows }
    setActive(updated)

    const newInProgress = inProgress.map(i => (i.id === updated.id ? updated : i))
    setInProgress(newInProgress)

    const everything = [...newInProgress, ...completed]
    saveInspectionStore(everything)
  }

  const markComplete = () => {
    if (!active) return

    const record = { ...active, completedAt: Date.now() }

    const newCompleted = [record, ...completed]
    setCompleted(newCompleted)

    const stillInProgress = inProgress.filter(i => i.id !== record.id)
    setInProgress(stillInProgress)

    const everything = [...stillInProgress, ...newCompleted]
    saveInspectionStore(everything)

    setActive(record)
  }

  const exportPDF = async () => {
    if (!active) return

    const content = document.getElementById('pdf-content')
    if (!content) return alert('Unable to find PDF content.')

    const canvas = await html2canvas(content)
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')

    const pageWidth = pdf.internal.pageSize.getWidth()
    const ratio = canvas.height / canvas.width
    const imgHeight = pageWidth * ratio

    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`${active.templateName}.pdf`)
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
      const options =
        row.options && row.options.length ? row.options : ['Good', 'Fair', 'Poor']
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

    return (
      <textarea
        className="w-full border rounded-xl px-3 py-1 text-sm"
        placeholder="Enter answer..."
        value={row.answer}
        onChange={e => setAnswer(index, { answer: e.target.value })}
      />
    )
  }

  if (active) {
    return (
      <div className="max-w-4xl mx-auto py-6 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-royal-700">{active.templateName}</h1>
          <button
            onClick={exportPDF}
            className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
          >
            Export PDF
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Started: {new Date(active.startedAt).toLocaleString()}
        </div>

        <div id="pdf-content" className="space-y-4 bg-white p-4 rounded-xl border">
          {active.answers.map((row: AnswerRow, i: number) => (
            <div key={row.id} className="p-3 border rounded-xl bg-gray-50">
              <div className="font-medium text-gray-800">{row.label}</div>

              <div className="mt-2">{renderAnswerInput(row, i)}</div>

              <textarea
                className="w-full border rounded-xl px-3 py-1 text-sm mt-2"
                placeholder="Notes (optional)"
                value={row.note || ''}
                onChange={e => setAnswer(i, { note: e.target.value })}
              />

              <input
                type="file"
                className="mt-2 text-xs"
                accept="image/*"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () =>
                    setAnswer(i, { photo: reader.result as string })
                  reader.readAsDataURL(file)
                }}
              />

              {row.photo && (
                <img
                  src={row.photo}
                  alt="attachment"
                  className="mt-2 h-32 object-cover rounded-xl border"
                />
              )}
            </div>
          ))}
        </div>

        {!active.completedAt && (
          <button
            onClick={markComplete}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white"
          >
            Complete Inspection
          </button>
        )}

        {active.completedAt && (
          <div className="text-emerald-700 font-semibold">
            Completed: {new Date(active.completedAt).toLocaleString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <h1 className="text-2xl font-bold text-royal-700">Inspections</h1>

      <div className="space-y-2">
        {inProgress.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-800 mb-2">In Progress</h2>
            {inProgress.map(i => (
              <button
                key={i.id}
                onClick={() => loadInspection(i)}
                className="w-full text-left border bg-white rounded-xl p-3 hover:bg-gray-50"
              >
                {i.templateName}
                <div className="text-xs text-gray-500">
                  Started {new Date(i.startedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}

        <div>
          <h2 className="font-semibold text-gray-800 mb-2">Start New</h2>
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => startInspection(t)}
              className="w-full text-left border bg-white rounded-xl p-3 hover:bg-gray-50"
            >
              {t.name}
            </button>
          ))}
        </div>

        {completed.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-800 mt-4 mb-2">Completed</h2>
            {completed.map(c => (
              <button
                key={c.id}
                onClick={() => loadInspection(c)}
                className="w-full text-left border bg-white rounded-xl p-3 hover:bg-gray-50"
              >
                {c.templateName}
                <div className="text-xs text-gray-500">
                  Completed {new Date(c.completedAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}