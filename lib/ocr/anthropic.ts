import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import * as z from "zod/v4"
import { OcrError, type OcrResult } from "@/lib/ocr/types"

/**
 * Provedor de OCR: Claude (visão) com saída estruturada.
 * Requer ANTHROPIC_API_KEY no servidor. A imagem nunca é enviada pelo navegador
 * diretamente ao provedor.
 */

const MODEL = process.env.OCR_MODEL ?? "claude-opus-5-5"

const field = z.object({
  value: z.string().nullable().describe("Texto exatamente como impresso; null se não estiver legível ou ausente."),
  confidence: z.number().describe("Confiança de 0 a 1 na leitura deste campo."),
})

const OcrSchema = z.object({
  legible: z.boolean().describe("false se a imagem não for uma comanda ou estiver ilegível."),
  comanda_number: field,
  address: field.describe("Logradouro (rua, avenida...) sem o número."),
  address_number: field,
  complement: field,
  neighborhood: field,
  city: field,
  state: field.describe("UF com 2 letras, se impressa."),
  other_fields: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .describe("Outros campos relevantes impressos (cliente, telefone, valor, observações)."),
  raw_text: z.string().describe("Transcrição do texto legível da comanda."),
})

const SYSTEM = `Você lê fotografias de comandas de entrega impressas no Brasil.
Transcreva apenas o que está efetivamente impresso ou escrito na imagem.
Nunca invente, complete ou deduza valores ausentes: use null quando o campo não estiver legível ou não existir.
A confiança deve refletir a nitidez da leitura (borrado, cortado ou manuscrito ambíguo => abaixo de 0.6).`

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new OcrError(
      "not_configured",
      "OCR não configurado: defina ANTHROPIC_API_KEY no servidor. A conferência manual continua disponível.",
    )
  }
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 })
  return client
}

export function isOcrConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function extractComanda(
  image: Buffer,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<OcrResult> {
  const anthropic = getClient()
  try {
    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(OcrSchema) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
            { type: "text", text: "Extraia os campos desta comanda de entrega." },
          ],
        },
      ],
    })

    if (response.stop_reason === "refusal") {
      throw new OcrError("refused", "O serviço de OCR recusou processar esta imagem. Faça a conferência manual.")
    }
    if (response.stop_reason === "max_tokens") {
      throw new OcrError("provider_error", "A leitura da imagem foi interrompida. Tente novamente.")
    }
    const parsed = response.parsed_output
    if (!parsed) {
      throw new OcrError("provider_error", "O OCR retornou uma resposta inválida. Tente novamente.")
    }

    const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))
    const fields = {
      comanda_number: { value: parsed.comanda_number.value, confidence: clamp(parsed.comanda_number.confidence) },
      address: { value: parsed.address.value, confidence: clamp(parsed.address.confidence) },
      address_number: { value: parsed.address_number.value, confidence: clamp(parsed.address_number.confidence) },
      complement: { value: parsed.complement.value, confidence: clamp(parsed.complement.confidence) },
      neighborhood: { value: parsed.neighborhood.value, confidence: clamp(parsed.neighborhood.confidence) },
      city: { value: parsed.city.value, confidence: clamp(parsed.city.confidence) },
      state: { value: parsed.state.value, confidence: clamp(parsed.state.confidence) },
      other_fields: parsed.other_fields.slice(0, 20),
    }
    const recognized = Object.values(fields).filter(
      (f): f is { value: string; confidence: number } => !Array.isArray(f) && !!f.value,
    )
    const overall = recognized.length
      ? recognized.reduce((s, f) => s + f.confidence, 0) / recognized.length
      : 0

    if (!parsed.legible || recognized.length === 0) {
      throw new OcrError("unreadable", "Não foi possível identificar uma comanda legível na imagem. Envie uma nova foto.")
    }

    return {
      provider: "anthropic",
      model: response.model,
      fields,
      rawText: parsed.raw_text.slice(0, 5000),
      overallConfidence: Math.round(overall * 1000) / 1000,
      legible: parsed.legible,
    }
  } catch (error) {
    if (error instanceof OcrError) throw error
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      throw new OcrError("timeout", "O OCR demorou demais para responder. Tente novamente.")
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new OcrError("not_configured", "Credencial do OCR inválida. Verifique ANTHROPIC_API_KEY.")
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new OcrError("provider_error", "Limite de uso do OCR atingido. Aguarde alguns instantes e tente novamente.")
    }
    if (error instanceof Anthropic.BadRequestError) {
      throw new OcrError("invalid_image", "A imagem enviada não pôde ser processada. Envie outra foto (JPG, PNG ou WEBP).")
    }
    if (error instanceof Anthropic.APIError) {
      throw new OcrError("provider_error", `Serviço de OCR indisponível (erro ${error.status ?? "?"}). Tente novamente.`)
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new OcrError("provider_error", "Falha de conexão com o serviço de OCR. Tente novamente.")
    }
    throw new OcrError("provider_error", "Falha inesperada no OCR. Tente novamente ou faça a conferência manual.")
  }
}
