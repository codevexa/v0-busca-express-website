/** Conversão de erros técnicos em mensagens claras (nunca expõe detalhes internos). */

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; code?: string }

interface PgLikeError {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

const UNIQUE_MESSAGES: Array<[RegExp, string]> = [
  [/deliveries_unique_comanda_day/, "Já existe uma entrega com este número de comanda nesta data."],
  [/profiles_matricula/, "Já existe um usuário com esta matrícula."],
  [/neighborhoods_company/, "Este bairro já está cadastrado."],
  [/delivery_areas_company_id_name/, "Já existe uma área com este nome."],
  [/extra_rules_company_id_name/, "Já existe uma regra com este nome."],
  [/payment_items_delivery_active/, "Uma das entregas já está em outro pagamento."],
  [/closing_periods_no_overlap/, "O período informado se sobrepõe a outro fechamento."],
  [/delivery_extras_rule_once/, "Este extra automático já foi lançado para a entrega."],
]

export function friendlyError(error: unknown): string {
  if (!error) return "Erro desconhecido."
  if (typeof error === "string") return error
  const e = error as PgLikeError & { name?: string }

  if (e.name === "TypeError" && /fetch/i.test(e.message ?? "")) {
    return "Falha de conexão. Verifique sua internet e tente novamente."
  }

  switch (e.code) {
    case "23505": {
      const text = `${e.message ?? ""} ${e.details ?? ""}`
      for (const [re, msg] of UNIQUE_MESSAGES) if (re.test(text)) return msg
      return "Registro duplicado."
    }
    case "23503":
      return e.message && !/violates foreign key/.test(e.message)
        ? e.message
        : "Registro relacionado não encontrado."
    case "23514":
      return e.message && !/violates check constraint/.test(e.message)
        ? e.message
        : "Dados inválidos para esta operação."
    case "23502":
      return "Preencha todos os campos obrigatórios."
    case "22P02":
    case "22023":
      return e.message && !/invalid input syntax/.test(e.message) ? e.message : "Valor inválido."
    case "42501":
      if (e.message && /row-level security/.test(e.message)) {
        return "Operação não autorizada para o seu usuário."
      }
      return e.message || "Operação não autorizada."
    case "40001":
      return e.message || "Os dados foram alterados por outra operação. Atualize e tente novamente."
    case "PGRST116":
      return "Registro não encontrado ou sem permissão de acesso."
    case "P0001":
      return e.message || "Operação recusada pelo sistema."
  }

  if (e.message) {
    if (/JWT|session|Auth session missing/i.test(e.message)) return "Sua sessão expirou. Entre novamente."
    if (/Failed to fetch|NetworkError|network/i.test(e.message)) {
      return "Falha de conexão. Verifique sua internet e tente novamente."
    }
    return e.message
  }
  return "Não foi possível concluir a operação."
}

export function isUnauthorized(error: unknown): boolean {
  const e = error as PgLikeError
  return e?.code === "42501"
}

export function fail(error: unknown): { ok: false; error: string; code?: string } {
  return { ok: false, error: friendlyError(error), code: (error as PgLikeError)?.code }
}
