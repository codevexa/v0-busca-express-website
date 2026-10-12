/**
 * Geração de relatórios em PDF (A4) com jsPDF + jspdf-autotable.
 * Cabeçalho com logotipo e identificação, tabelas que quebram página sem
 * cortar linhas (cabeçalho repetido), totais e paginação "Página X de Y".
 */
import { jsPDF } from "jspdf"
import { autoTable } from "jspdf-autotable"

export interface ReportColumn {
  key: string
  label: string
  align?: "left" | "right" | "center"
  width?: number
}

export interface ReportSection {
  title?: string
  columns: ReportColumn[]
  rows: Array<Record<string, string | number>>
  totals?: Record<string, string | number>
  note?: string
}

export interface ReportDocument {
  companyName: string
  reportTitle: string
  title: string
  period: string
  filters: string[]
  generatedBy: string
  generatedAt: Date
  logoDataUrl?: string | null
  orientation?: "portrait" | "landscape"
  summary?: Array<{ label: string; value: string }>
  sections: ReportSection[]
}

const BORDO: [number, number, number] = [128, 0, 32]
const BORDO_ESCURO: [number, number, number] = [74, 0, 18]
const DOURADO: [number, number, number] = [212, 175, 55]
const MARGIN = 12

export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.type === "image/svg+xml") {
      // jsPDF não desenha SVG: converte para PNG.
      const svgUrl = URL.createObjectURL(blob)
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error("svg"))
          img.src = svgUrl
        })
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth || 256
        canvas.height = img.naturalHeight || 256
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL("image/png")
      } finally {
        URL.revokeObjectURL(svgUrl)
      }
    }
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function drawHeader(doc: jsPDF, r: ReportDocument) {
  const width = doc.internal.pageSize.getWidth()
  doc.setFillColor(...BORDO_ESCURO)
  doc.rect(0, 0, width, 24, "F")
  doc.setFillColor(...BORDO)
  doc.rect(0, 0, width * 0.62, 24, "F")

  let textX = MARGIN
  if (r.logoDataUrl) {
    try {
      const format = r.logoDataUrl.startsWith("data:image/png") ? "PNG" : r.logoDataUrl.startsWith("data:image/webp") ? "WEBP" : "JPEG"
      doc.addImage(r.logoDataUrl, format, MARGIN, 3.5, 17, 17, undefined, "FAST")
      textX = MARGIN + 21
    } catch {
      textX = MARGIN
    }
  } else {
    doc.setDrawColor(...DOURADO)
    doc.setLineWidth(0.6)
    doc.roundedRect(MARGIN, 4, 16, 16, 2, 2, "S")
    doc.setTextColor(...DOURADO)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("O", MARGIN + 8, 14.5, { align: "center" })
    textX = MARGIN + 20
  }

  doc.setTextColor(...DOURADO)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text(r.reportTitle, textX, 10)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.text(r.title, textX, 16)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(r.companyName, textX, 20.5)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.text(`Período: ${r.period}`, width - MARGIN, 10, { align: "right" })
  doc.text(`Gerado em ${formatDateTime(r.generatedAt)}`, width - MARGIN, 15, { align: "right" })
  if (r.generatedBy) doc.text(`Por: ${r.generatedBy}`, width - MARGIN, 20, { align: "right" })
}

function drawFooter(doc: jsPDF, r: ReportDocument, page: number, pages: number) {
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  doc.setDrawColor(...DOURADO)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, height - 10, width - MARGIN, height - 10)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(90, 90, 90)
  doc.text(`${r.reportTitle} · ${r.title}`, MARGIN, height - 6)
  doc.text(`Página ${page} de ${pages}`, width - MARGIN, height - 6, { align: "right" })
}

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export function buildReportPdf(r: ReportDocument): jsPDF {
  const doc = new jsPDF({ orientation: r.orientation ?? "portrait", unit: "mm", format: "a4", compress: true })
  doc.setProperties({ title: `${r.reportTitle} - ${r.title}`, subject: r.period, creator: r.companyName })
  const width = doc.internal.pageSize.getWidth()
  let y = 30

  // Filtros aplicados
  doc.setTextColor(40, 40, 40)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("Filtros aplicados:", MARGIN, y)
  doc.setFont("helvetica", "normal")
  const filterText = r.filters.length ? r.filters.join(" · ") : "Nenhum (todos os registros do período)"
  const lines = doc.splitTextToSize(filterText, width - MARGIN * 2 - 30)
  doc.text(lines, MARGIN + 30, y)
  y += Math.max(5, lines.length * 4) + 2

  // Resumo em blocos
  if (r.summary?.length) {
    const perRow = r.orientation === "landscape" ? 6 : 4
    const boxW = (width - MARGIN * 2 - (perRow - 1) * 3) / perRow
    r.summary.forEach((s, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const x = MARGIN + col * (boxW + 3)
      const by = y + row * 16
      doc.setDrawColor(220, 205, 180)
      doc.setFillColor(250, 246, 238)
      doc.roundedRect(x, by, boxW, 13, 1.5, 1.5, "FD")
      doc.setFontSize(7)
      doc.setTextColor(110, 90, 60)
      doc.text(s.label.toUpperCase(), x + 2.5, by + 4.5)
      doc.setFontSize(10.5)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(...BORDO)
      doc.text(s.value, x + 2.5, by + 10.5)
      doc.setFont("helvetica", "normal")
    })
    y += Math.ceil(r.summary.length / perRow) * 16 + 2
  }

  for (const section of r.sections) {
    if (section.title) {
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage()
        y = 30
      }
      doc.setFont("helvetica", "bold")
      doc.setFontSize(10)
      doc.setTextColor(...BORDO)
      doc.text(section.title, MARGIN, y + 4)
      y += 7
    }

    const head = [section.columns.map((c) => c.label)]
    const body = section.rows.map((row) => section.columns.map((c) => String(row[c.key] ?? "")))
    const foot = section.totals ? [section.columns.map((c) => String(section.totals?.[c.key] ?? ""))] : undefined
    const columnStyles: Record<number, { halign?: "left" | "right" | "center"; cellWidth?: number }> = {}
    section.columns.forEach((c, i) => {
      columnStyles[i] = { halign: c.align ?? "left", ...(c.width ? { cellWidth: c.width } : {}) }
    })

    autoTable(doc, {
      head,
      body: body.length ? body : [[{ content: "Nenhum registro encontrado para os filtros aplicados.", colSpan: section.columns.length, styles: { halign: "center", textColor: [120, 120, 120] } } as never]],
      foot,
      startY: y,
      margin: { top: 30, bottom: 15, left: MARGIN, right: MARGIN },
      theme: "grid",
      showHead: "everyPage",
      showFoot: "lastPage",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.6, overflow: "linebreak", lineColor: [225, 215, 200], lineWidth: 0.1, textColor: [30, 30, 30] },
      headStyles: { fillColor: BORDO, textColor: DOURADO, fontStyle: "bold", fontSize: 7.5 },
      footStyles: { fillColor: [245, 236, 220], textColor: BORDO, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [252, 250, 246] },
      columnStyles,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6

    if (section.note) {
      doc.setFont("helvetica", "italic")
      doc.setFontSize(7.5)
      doc.setTextColor(100, 100, 100)
      const noteLines = doc.splitTextToSize(section.note, width - MARGIN * 2)
      doc.text(noteLines, MARGIN, y)
      y += noteLines.length * 3.5 + 3
    }
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    drawHeader(doc, r)
    drawFooter(doc, r, i, pages)
  }
  return doc
}

export function reportFileName(title: string, period: string) {
  const slug = `${title}-${period}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
  return `ossala-${slug}.pdf`
}
