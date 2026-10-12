/** Campos que o OCR tenta reconhecer em uma comanda impressa. */
export const OCR_FIELDS = [
  { key: "comanda_number", label: "Número da comanda" },
  { key: "address", label: "Endereço" },
  { key: "address_number", label: "Número do imóvel" },
  { key: "complement", label: "Complemento" },
  { key: "neighborhood", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "UF" },
] as const

export type OcrFieldKey = (typeof OCR_FIELDS)[number]["key"]

export interface OcrField {
  value: string | null
  /** 0 a 1, informado pelo modelo. */
  confidence: number
}

export type OcrFields = Record<OcrFieldKey, OcrField> & {
  other_fields?: Array<{ label: string; value: string }>
}

export interface OcrResult {
  provider: string
  model: string
  fields: OcrFields
  rawText: string
  overallConfidence: number
  legible: boolean
}

export type ComparisonStatus = "match" | "divergent" | "missing_registered" | "not_recognized" | "low_confidence"

export interface ComparisonRow {
  field: OcrFieldKey
  label: string
  registered: string | null
  identified: string | null
  confidence: number | null
  status: ComparisonStatus
}

export class OcrError extends Error {
  constructor(
    public code: "not_configured" | "invalid_image" | "provider_error" | "unreadable" | "refused" | "timeout",
    message: string,
  ) {
    super(message)
    this.name = "OcrError"
  }
}

export const LOW_CONFIDENCE = 0.6
