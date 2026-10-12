import { LOW_CONFIDENCE, OCR_FIELDS, type ComparisonRow, type OcrFields } from "@/lib/ocr/types"

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\b(r|r\.)\s/g, "rua "],
  [/\b(av|av\.|avda)\s/g, "avenida "],
  [/\b(tv|tv\.|trav|trav\.)\s/g, "travessa "],
  [/\b(al|al\.)\s/g, "alameda "],
  [/\b(est|est\.)\s/g, "estrada "],
  [/\b(rod|rod\.)\s/g, "rodovia "],
  [/\b(pc|pc\.|pca|pça)\s/g, "praca "],
  [/\b(dr|dr\.)\s/g, "doutor "],
  [/\b(prof|prof\.)\s/g, "professor "],
  [/\b(sto|sto\.)\s/g, "santo "],
  [/\b(sta|sta\.)\s/g, "santa "],
  [/\b(apto|ap\.|ap)\s/g, "apartamento "],
]

/** Normalização equivalente a app.normalize() + abreviações de logradouro. */
export function normalizeForCompare(value: string | null | undefined, field?: string): string {
  if (!value) return ""
  let v = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[º°ª]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (field === "comanda_number") {
    return v.replace(/^(n|no|nº|num|numero|comanda|pedido|#)\s*[:.-]?\s*/i, "").replace(/[^a-z0-9]/g, "")
  }
  if (field === "address_number") {
    return v.replace(/^(n|no|numero)\s*[:.]?\s*/, "").replace(/[^a-z0-9]/g, "")
  }
  v = ` ${v} `
  for (const [re, rep] of ABBREVIATIONS) v = v.replace(re, rep)
  return v.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function similar(a: string, b: string): boolean {
  if (a === b) return true
  if (!a || !b) return false
  // Tolera pequenas diferenças (ex.: "rua joao pessoa" x "joao pessoa").
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) >= 4
  return levenshtein(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.12))
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

export interface RegisteredDelivery {
  comanda_number: string | null
  address: string | null
  address_number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
}

/**
 * Compara os dados cadastrados com os identificados. Campos não reconhecidos
 * nunca são tratados como correspondentes, e valores de baixa confiança são
 * sinalizados para conferência manual.
 */
export function compareDelivery(registered: RegisteredDelivery | null, fields: Partial<OcrFields>): ComparisonRow[] {
  return OCR_FIELDS.map(({ key, label }) => {
    const reg = registered?.[key] ?? null
    const ocr = fields[key]
    const identified = ocr?.value?.toString().trim() || null
    const confidence = ocr ? Number(ocr.confidence ?? 0) : null

    let status: ComparisonRow["status"]
    if (!identified) {
      status = "not_recognized"
    } else if (!reg) {
      status = "missing_registered"
    } else if (similar(normalizeForCompare(reg, key), normalizeForCompare(identified, key))) {
      status = confidence !== null && confidence < LOW_CONFIDENCE ? "low_confidence" : "match"
    } else {
      status = confidence !== null && confidence < LOW_CONFIDENCE ? "low_confidence" : "divergent"
    }
    return { field: key, label, registered: reg, identified, confidence, status }
  })
}

/** Divergências que exigem atenção (campos opcionais ausentes não contam). */
export function countDivergences(rows: ComparisonRow[]): number {
  const relevant = new Set(["comanda_number", "address", "address_number", "neighborhood"])
  return rows.filter(
    (r) => r.status === "divergent" || (r.status === "low_confidence" && relevant.has(r.field)),
  ).length
}

export function extractComandaCandidates(value: string | null | undefined): string[] {
  if (!value) return []
  const cleaned = value.toUpperCase().replace(/^(N|NO|Nº|NUM|NUMERO|COMANDA|PEDIDO|#)\s*[:.-]?\s*/i, "").trim()
  const digits = cleaned.replace(/\D/g, "")
  return Array.from(new Set([cleaned, digits].filter((v) => v.length > 0)))
}
