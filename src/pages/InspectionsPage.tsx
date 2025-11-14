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

type AnswerRow = {
  questionId: string
  label: string
  type: QuestionType
  options?: string[]
  instruction?: string
  refImages?: string[]
  sectionId: string
  sectionTitle?: string
  sectionHeaderImageDataUrl?: string
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

/** Safely normalise questions coming from localStorage (old or new format) */
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
  // new schema: typed objects
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

/** Safely load templates (with sections) from localStorage */
function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TPL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.map((t: any) => {
      if (Array.isArray(t.sections) && t.sections.length > 0) {
        return {
          id: t.id || makeId(),
          name: t.name || 'Untitled',
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

      // fallback: flat questions -> single section
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
        site: t.site || '',
        logoDataUrl: t.logoDataUrl || undefined,
        sections: [defaultSection],
      } as Template
    })
  } catch (err) {
    console.error('Failed to load templates for inspections', err)
    return []
  }
}

/** Safely load inspections from localStorage */
function loadInspections(): Inspection[] {
  try {
    const raw = localStorage.getItem(INSP_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch (err) {
    console.error('Failed to load inspections', err)
    return []
  }
}

function saveInspections(list: Inspection[]) {
  try {
    localStorage.setItem(INSP_KEY, JSON.stringify(list))
  } catch (err) {
    console.error('Failed to save inspections', err)
  }
}

/** Group answers by section for rendering + PDF */
function groupBySection(answers: AnswerRow[]) {
  const map: Record<string, { title: string; headerImageDataUrl?: string; rows: AnswerRow[] }> =
    {}

  answers.forEach(row => {
    const id = row.sectionId || 'default'
    if (!map[id]) {
      map[id] = {
        title: row.sectionTitle || 'Section',
        headerImageDataUrl: row.sectionHeaderImageDataUrl,
        rows: [],
      }
    }
    map[id].rows.push(row)
  })

  return Object.values(map)
}

export default function InspectionsPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [active, setActive] = useState<Inspection | null>(null)

  // Initial load
  useEffect(() => {
    setTemplates(loadTemplates())
    setInspections(loadInspections())
  }, [])

  // Persist inspections
  useEffect(() => {
    saveInspections(inspections)
  }, [inspections])

  const startInspection = (tpl: Template) => {
    try {
      const answers: AnswerRow[] = []

      ;(tpl.sections || []).forEach(sec => {
        ;(sec.questions || []).forEach(q => {
          answers.push({
            questionId: q.id,
            label: q.label,
            type: q.type,
            options: q.options,
            instruction: q.instruction,
            refImages: q.refImages,
            sectionId: sec.id,
            sectionTitle: sec.title,
            sectionHeaderImageDataUrl: sec.headerImageDataUrl,
            answer: '',
            note: '',
            photos: [],
          })
        })
      })

      const insp: Inspection = {
        id: makeId(),
        templateId: tpl.id,
        templateName: tpl.name,
        site: tpl.site,
        logoDataUrl: tpl.logoDataUrl,
        startedAt: new Date().toISOString(),
        answers,
      }

      setInspections(prev => [insp, ...prev])
      setActive(insp)
    } catch (err) {
      console.error('Error starting inspection', err)
      alert('Could not start inspection – check the console for details.')
    }
  }

  const resumeInspection = (insp: Inspection) => {
    setActive(insp)
  }

  const updateInspectionInList = (updated: Inspection) => {
    setInspections(prev => prev.map(i => (i.id === updated.id ? updated : i)))
  }

  const setAnswer = (index: number, patch: Partial<AnswerRow>) => {
    if (!active) return
    const updatedAnswers = active.answers ? [...active.answers] : []
    if (!updatedAnswers[index]) return

    updatedAnswers[index] = { ...updatedAnswers[index], ...patch }

    const updated: Inspection = { ...active, answers: updatedAnswers }
    setActive(updated)
    updateInspectionInList(updated)
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
          const existing = active.answers[index]?.photos || []
          setAnswer(index, { photos: [...existing, ...readersDone] })
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const saveInspectionProgress = () => {
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
              className{
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

    let lastSectionId = ''

    const rowsHtml = (insp.answers || [])
      .map(a => {
        let sectionHeaderHtml = ''
        if (a.sectionId && a.sectionId !== lastSectionId) {
          lastSectionId = a.sectionId
          const headerImg = a.sectionHeaderImageDataUrl
            ? `<img src="${a.sectionHeaderImageDataUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;margin-right:8px;" />`
            : ''
          sectionHeaderHtml = `
            <tr>
              <td colspan="4" style="padding:10px 8px;border:1px solid #ddd;background:#f9fafb;">
                <div style="display:flex;align-items:center;gap:8px;">
                  ${headerImg}
                  <div style="font-weight:600;font-size:13px;color:#111827;">${escapeHtml(
                    a.sectionTitle || 'Section',
                  )}</div>
                </div>
              </td>
            </tr>
          `
        }

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
        const instructionHtml = a.instruction
          ? `<div style="margin-top:4px;font-size:11px;color:#6b7280;">${escapeHtml(
              a.instruction,
            )}</div>`
          : ''

        return `
          ${sectionHeaderHtml}
          <tr>
            <td style="padding:8px;border:1px solid #ddd;vertical-align:top;">
              <strong>${escapeHtml(a.label || '')}</strong>
              ${instructionHtml}
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

  const groupedBySection = (answers: AnswerRow[] | undefined) => {
    if (!answers || !answers.length) return []
    return groupBySection(answers)
  }

  // ✅ defined ONCE here (not duplicated anywhere else)
  const inProgress = inspections.filter(i => !i.completedAt)
  const completed = inspections.filter(i => i.completedAt)

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-royal-700">Inspections</h1>
          <p className="text-sm text-gray-600">
            Run inspections with sections, header images, reference images and instructions. Save
            in progress, or complete and export as PDF.
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
                    <div className="mt-2 space-y-3">
                      {groupedBySection(insp.answers).map((sec, idx) => (
                        <div key={idx} className="border rounded-xl p-2">
                          <div className="flex items-center gap-2 mb-2">
                            {sec.headerImageDataUrl && (
                              <img
                                src={sec.headerImageDataUrl}
                                alt="section"
                                className="w-8 h-8 rounded-lg object-cover border"
                              />
                            )}
                            <div className="font-semibold text-xs text-gray-800">
                              {sec.title}
                            </div>
                          </div>
                          <ul className="space-y-2">
                            {sec.rows.map((a, i) => (
                              <li key={i} className="border rounded-xl p-2">
                                <div className="font-semibold">{a.label}</div>
                                {a.instruction && (
                                  <div className="text-[11px] text-gray-500 mt-1">
                                    {a.instruction}
                                  </div>
                                )}
                                <div>Answer: {a.answer || '—'}</div>
                                {a.note && <div>Note: {a.note}</div>}
                                {a.refImages && a.refImages.length > 0 && (
                                  <div className="mt-1">
                                    <div className="text-[11px] text-gray-500 mb-1">
                                      Reference:
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {a.refImages.map((src, idx2) => (
                                        <img
                                          key={idx2}
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
                                    <div className="text-[11px] text-gray-500 mb-1">
                                      Evidence:
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {a.photos.map((src, idx2) => (
                                        <img
                                          key={idx2}
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
                        </div>
                      ))}
                    </div>
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

          {!active.answers || active.answers.length === 0 ? (
            <div className="text-sm text-gray-600 border rounded-xl p-3">
              This inspection has no questions. Check the template configuration.
            </div>
          ) : (
            <div className="space-y-4">
              {groupedBySection(active.answers).map((sec, sIdx) => (
                <div key={sIdx} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {sec.headerImageDataUrl && (
                      <img
                        src={sec.headerImageDataUrl}
                        alt="section"
                        className="w-8 h-8 rounded-lg object-cover border"
                      />
                    )}
                    <div className="font-semibold text-sm text-gray-800">{sec.title}</div>
                  </div>
                  {sec.rows.map((row, localIdx) => {
                    // Find the global index in active.answers
                    const globalIndex = active.answers.findIndex(
                      a =>
                        a.sectionId === row.sectionId &&
                        a.questionId === row.questionId &&
                        a.label === row.label,
                    )
                    const idxToUse = globalIndex >= 0 ? globalIndex : localIdx
                    const actualRow = active.answers[idxToUse] || row

                    return (
                      <div
                        key={row.questionId + '-' + localIdx}
                        className="border rounded-xl p-3 text-sm space-y-2"
                      >
                        <div className="font-semibold">{actualRow.label}</div>
                        {actualRow.instruction && (
                          <div className="text-[11px] text-gray-500">
                            {actualRow.instruction}
                          </div>
                        )}
                        {actualRow.refImages && actualRow.refImages.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {actualRow.refImages.map((src, idx2) => (
                              <img
                                key={idx2}
                                src={src}
                                alt="reference"
                                className="h-10 w-10 object-cover rounded-md border"
                              />
                            ))}
                          </div>
                        )}
                        {renderAnswerInput(actualRow, idxToUse)}
                        <textarea
                          className="w-full border rounded-xl px-3 py-1 text-xs mt-2"
                          placeholder="Optional note"
                          value={actualRow.note || ''}
                          onChange={e => setAnswer(idxToUse, { note: e.target.value })}
                        />
                        <div className="flex flex-col gap-1 mt-2">
                          <label className="text-xs text-gray-500">
                            Attach photos (stored in this browser only)
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={e => handlePhotoChange(idxToUse, e.target.files)}
                            className="text-xs"
                          />
                          {actualRow.photos && actualRow.photos.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {actualRow.photos.map((src, idx2) => (
                                <img
                                  key={idx2}
                                  src={src}
                                  alt="preview"
                                  className="h-12 w-12 object-cover rounded-md border"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

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