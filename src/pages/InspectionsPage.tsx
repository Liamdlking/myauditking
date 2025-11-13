import React, { useEffect, useState } from 'react'

type QuestionType = 'yesno' | 'rating' | 'multi' | 'text'

type Question = {
  id: string
  label: string
  type: QuestionType
  options?: string[]
  instruction?: string
  refImages?: string[]
}

type Template = {
  id: string
  name: string
  site?: string
  logoDataUrl?: string
  questions: Question[]
}

type AnswerRow = {
  questionId: string
  label: string
  type: QuestionType
  options?: string[]
  instruction?: string
  refImages?: string[]
  answer: string
  note?: string
  photos?: string[]
}

type Inspection = {
  id: string
  templateId: string
  templateName: string
  site?: string
  logoDataUrl?: string
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
    // very old schema: strings only
    return raw.map((label: string) => ({
      id: makeId(),
      label,
      type: 'yesno' as QuestionType,
    }))
  }
  // new schema: typed questions
  return raw.map((q: any, idx: number) => ({
    id: q.id || `q${idx + 1}`,
    label: q.label || String(q),
    type: (['yesno', 'rating', 'multi', 'text'] as QuestionType[]).includes(q.type)
      ? q.type
      : ('yesno' as QuestionType),
    options: Array.isArray(q.options) ? q.options : undefined,
    instruction: typeof q.instruction === 'string' ? q.instruction : undefined,
    refImages: Array.isArray(q.refImages) ? q.refImages : undefined,
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
      logoDataUrl: t.logoDataUrl || undefined,
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
      instruction: q.instruction,
      refImages: q.refImages,
      answer: '',
      note: '',
      photos: [],
    }))
    const insp: Inspection = {
      id: makeId(),
      templateId: tpl.id,
      templateName: tpl.name,
      site: tpl.site,
      logoDataUrl: tpl.logoDataUrl,
      startedAt: new Date().toISOString(),
      answers,
    }
    // add to list immediately so it's "in progress" and survives reload
    setInspections(prev => [insp, ...prev])
    setActive(insp)
  }

  const resumeInspection = (insp: Inspection) => {
    setActive(insp)
  }

  const updateInspectionInList = (updated: Inspection) => {
    setInspections(prev => prev.map(i => (i.id === updated.id ? updated : i)))
  }

  const setAnswer = (index: number, patch: Partial<AnswerRow>) => {
    if (!active) return
    const updated: Inspection = {
      ...active,
      answers: active.answers.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }
    setActive(updated)
    updateInspectionInList(updated) // autosave progress
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

  const saveInspectionProgress = () => {
    // answers already synced to list via setAnswer
    setActive(null)
  }

  const discardInspection = () => {
    if (!active) return
    if (!confirm('Discard this inspection? This cannot be undone.')) return
    setInspections(prev => prev.filter(i => i.id !== active.id))
    setActive(null)
  }

  const completeInspection = () => {
    if (!active) return
    const done: Inspection = {
      ...active,
      completedAt: new Date().toISOString(),
    }
    setActive(null)
    updateInspectionInList(done)
  }

  const inProgress = inspections.filter(i => !i.completedAt)
  const completed = inspections.filter(i => i.completedAt)

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

  const openPdfWindow = (insp: Inspection) => {
    const w = window.open('', '_blank', 'width=900,height=1000')
    if (!w) {
      alert('Popup blocked. Please allow popups for this site to download the PDF.')
      return
    }

    const started = new Date(insp.startedAt).toLocaleString()
    const completed = insp.completedAt
      ? new Date(insp.completedAt).toLocaleString()
      : '—'

    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    const rowsHtml = insp.answers
      .map((a, idx) => {
        const refHtml =
          a.refImages && a.refImages.length
            ? `<div style="margin-bottom:4px;font-size:10px;color:#6b7280;">Reference:</div>` +
              a.refImages
                .map(
                  src =>
                    `<img src="${src}" style="width:56px;height:56px;object-fit:cover;border-radius:4px;border:1px solid #ddd;margin-right:4px;margin-top:2px;" />`,
                )
                .join('')
            : ''
        const photosHtml =
          a.photos && a.photos.length
            ? `<div style="margin-top:6px;margin-bottom:2px;font-size:10px;color:#6b7280;">Evidence:</div>` +
              a.photos
                .map(
                  src =>
                    `<img src="${src}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid #ddd;margin-right:4px;margin-top:2px;" />`,
                )
                .join('')
            : ''
        return `
          <tr>
            <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">
              <strong>${idx + 1}. ${escapeHtml(a.label || '')}</strong>
              ${
                a.instruction
                  ? `<div style="margin-top:4px;font-size:11px;color:#6b7280;">${escapeHtml(
                      a.instruction,
                    )}</div>`
                  : ''
              }
            </td>
            <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">
              ${escapeHtml(a.answer || '—')}
            </td>
            <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">
              ${a.note ? escapeHtml(a.note) : ''}
            </td>
            <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">
              ${refHtml}${photosHtml}
            </td>
          </tr>
        `
      })
      .join('')

    const logoHtml = insp.logoDataUrl
      ? `<img src="${insp.logoDataUrl}" style="width:32px;height:32px;border-radius:999px;object-fit:cover;border:1px solid #e5e7eb;" />`
      : `<div style="width:32px;height:32px;border-radius:999px;background:linear-gradient(135deg,#3730a3,#facc15);"></div>`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Audit King Report</title>
        </head>
        <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:24px; background:#ffffff; color:#111827;">
          <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:8px;">
              ${logoHtml}
              <div style="font-weight:800;font-size:18px;color:#312e81;">
                Audit <span style="color:#facc15;">King</span>
              </div>
            </div>
            <div style="font-size:12px;color:#6b7280;">Inspection report</div>
          </header>

          <h1 style="font-size:20px;font-weight:700;color:#111827;margin-bottom:4px;">
            ${escapeHtml(insp.templateName || '')}
          </h1>
          <p style="font-size:13px;color:#4b5563;margin:0 0 16px 0;">
            Site: <strong>${escapeHtml(insp.site || '—')}</strong>
          </p>

          <div style="font-size:12px;color:#4b5563;margin-bottom:16px;">
            <div>Started: <strong>${started}</strong></div>
            <div>Completed: <strong>${completed}</strong></div>
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr>
                <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f3f4f6;">Question</th>
                <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f3f4f6;">Answer</th>
                <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f3f4f6;">Note</th>
                <th style="text-align:left;padding:8px;border:1px solid #ddd;background:#f3f4f6;">Images</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <p style="font-size:11px;color:#9ca3af;margin-top:24px;">
            Generated by Audit King Pro. Use your browser's "Save as PDF" option when printing.
          </p>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `

    w.document.open()
    w.document.write(html)
    w.document.close()
    w.focus()
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-royal-700">Inspections</h1>
          <p className="text-sm text-gray-600">
            Run inspections with reference images and instructions, save in progress, or complete
            and export as PDF.
          </p>
        </div>
      </div>

      {/* No active inspection: show lists */}
      {!active && (
        <>
          {/* Start new */}
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
                  className="px-3 py-2 rounded-xl border text-sm bg-white hover:bg-gray-50 flex items-center gap-2"
                >
                  {t.logoDataUrl && (
                    <img
                      src={t.logoDataUrl}
                      alt="logo"
                      className="w-5 h-5 rounded-full object-cover border"
                    />
                  )}
                  <span>
                    {t.name}
                    {t.site ? ` — ${t.site}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* In-progress inspections */}
          <div className="space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">In-progress inspections</h2>
            {inProgress.length === 0 && (
              <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
                No in-progress inspections.
              </div>
            )}
            {inProgress.map(insp => (
              <div
                key={insp.id}
                className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  {insp.logoDataUrl && (
                    <img
                      src={insp.logoDataUrl}
                      alt="logo"
                      className="w-8 h-8 rounded-full object-cover border"
                    />
                  )}
                  <div>
                    <div className="font-semibold text-royal-700">{insp.templateName}</div>
                    {insp.site && <div className="text-xs text-gray-500">Site: {insp.site}</div>}
                    <div className="text-xs text-gray-500">
                      Started: {insp.startedAt.slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => resumeInspection(insp)}
                    className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => openPdfWindow(insp)}
                    className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Completed inspections */}
          <div className="space-y-2">
            <h2 className="font-semibold text-sm text-gray-700">Completed inspections</h2>
            {completed.length === 0 && (
              <div className="bg-white border rounded-2xl p-4 text-sm text-gray-600">
                No completed inspections yet.
              </div>
            )}
            {completed.map(insp => (
              <div key={insp.id} className="bg-white border rounded-2xl p-4">
                <div className="flex justify-between text-sm">
                  <div className="flex items-start gap-2">
                    {insp.logoDataUrl && (
                      <img
                        src={insp.logoDataUrl}
                        alt="logo"
                        className="w-8 h-8 rounded-full object-cover border"
                      />
                    )}
                    <div>
                      <div className="font-semibold text-royal-700">{insp.templateName}</div>
                      {insp.site && <div className="text-xs text-gray-500">Site: {insp.site}</div>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    <div>Started: {insp.startedAt.slice(0, 16).replace('T', ' ')}</div>
                    {insp.completedAt && (
                      <div>Completed: {insp.completedAt.slice(0, 16).replace('T', ' ')}</div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex justify-between items-center text-xs">
                  <details className="text-gray-600">
                    <summary className="cursor-pointer">Show answers</summary>
                    <ul className="mt-2 space-y-2">
                      {insp.answers.map((a, i) => (
                        <li key={i} className="border rounded-xl p-2">
                          <div className="font-semibold">
                            {i + 1}. {a.label}
                          </div>
                          {a.instruction && (
                            <div className="text-[11px] text-gray-500 mt-1">
                              {a.instruction}
                            </div>
                          )}
                          <div>Answer: {a.answer || '—'}</div>
                          {a.note && <div>Note: {a.note}</div>}
                          {(a.refImages && a.refImages.length > 0) && (
                            <div className="mt-1">
                              <div className="text-[11px] text-gray-500 mb-1">Reference:</div>
                              <div className="flex flex-wrap gap-2">
                                {a.refImages.map((src, idx) => (
                                  <img
                                    key={idx}
                                    src={src}
                                    alt="reference"
                                    className="h-10 w-10 object-cover rounded-md border"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {a.photos && a.photos.length > 0 && (
                            <div className="mt-1">
                              <div className="text-[11px] text-gray-500 mb-1">Evidence:</div>
                              <div className="flex flex-wrap gap-2">
                                {a.photos.map((src, idx) => (
                                  <img
                                    key={idx}
                                    src={src}
                                    alt="evidence"
                                    className="h-10 w-10 object-cover rounded-md border"
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                  <button
                    onClick={() => openPdfWindow(insp)}
                    className="px-3 py-1 rounded-xl border text-xs hover:bg-gray-50"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Active inspection UI */}
      {active && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-start gap-2">
              {active.logoDataUrl && (
                <img
                  src={active.logoDataUrl}
                  alt="logo"
                  className="w-8 h-8 rounded-full object-cover border"
                />
              )}
              <div>
                <h2 className="font-semibold text-royal-700">{active.templateName}</h2>
                {active.site && <div className="text-xs text-gray-500">Site: {active.site}</div>}
                <div className="text-xs text-gray-500">
                  Started: {active.startedAt.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={discardInspection}
                className="text-sm px-3 py-1 rounded-xl border text-rose-600 hover:bg-rose-50"
              >
                Discard
              </button>
              <button
                onClick={saveInspectionProgress}
                className="text-sm px-3 py-1 rounded-xl border hover:bg-gray-50"
              >
                Save progress
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {active.answers.map((row, index) => (
              <div key={row.questionId} className="border rounded-xl p-3 text-sm space-y-2">
                <div className="font-semibold">
                  {index + 1}. {row.label}
                </div>
                {row.instruction && (
                  <div className="text-[11px] text-gray-500">{row.instruction}</div>
                )}
                {row.refImages && row.refImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {row.refImages.map((src, idx) => (
                      <img
                        key={idx}
                        src={src}
                        alt="reference"
                        className="h-10 w-10 object-cover rounded-md border"
                      />
                    ))}
                  </div>
                )}
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
              onClick={completeInspection}
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