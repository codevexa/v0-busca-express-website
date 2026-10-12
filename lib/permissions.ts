import type { Role, SessionContext } from "@/lib/domain"

/** Chaves de permissão usadas pela aplicação (o banco é a fonte da verdade). */
export const P = {
  dashboard: "dashboard.visualizar",
  entregasVer: "entregas.visualizar",
  entregasCriar: "entregas.criar",
  entregasEditar: "entregas.editar",
  entregasExcluir: "entregas.excluir",
  entregasAtribuir: "entregas.atribuir",
  entregasConfirmar: "entregas.confirmar",
  entregasCorrigir: "entregas.corrigir_confirmacao",
  entregasExportar: "entregas.exportar",
  motoboysVer: "motoboys.visualizar",
  motoboysCriar: "motoboys.criar",
  motoboysEditar: "motoboys.editar",
  areasVer: "areas.visualizar",
  areasEditar: "areas.editar",
  extrasVer: "extras.visualizar",
  extrasCriar: "extras.criar",
  extrasEditar: "extras.editar",
  financeiroVer: "financeiro.visualizar",
  financeiroAjustar: "financeiro.ajustar",
  pagamentosVer: "pagamentos.visualizar",
  pagamentosCriar: "pagamentos.criar",
  pagamentosAprovar: "pagamentos.aprovar",
  pagamentosConfirmar: "pagamentos.confirmar",
  pagamentosExcluir: "pagamentos.excluir",
  fechamentosVer: "fechamentos.visualizar",
  fechamentosCriar: "fechamentos.criar",
  fechamentosAprovar: "fechamentos.aprovar",
  fechamentosEncerrar: "fechamentos.confirmar",
  fechamentosReabrir: "fechamentos.reabrir",
  fechamentosCorrigir: "fechamentos.corrigir",
  mapaVer: "mapa.visualizar",
  mapaEditar: "mapa.editar",
  fotosVer: "fotos.visualizar",
  fotosCriar: "fotos.criar",
  conferenciaVer: "conferencia.visualizar",
  conferenciaCriar: "conferencia.criar",
  conferenciaAprovar: "conferencia.aprovar",
  relatoriosVer: "relatorios.visualizar",
  relatoriosExportar: "relatorios.exportar",
  alertasVer: "alertas.visualizar",
  usuariosVer: "usuarios.visualizar",
  usuariosGerenciar: "usuarios.gerenciar",
  configuracoes: "configuracoes.administrar",
  auditoria: "auditoria.visualizar",
} as const

export type PermissionKey = (typeof P)[keyof typeof P]

export function can(ctx: Pick<SessionContext, "role" | "permissions"> | null | undefined, key: string): boolean {
  if (!ctx) return false
  if (ctx.role === "ADMIN") return true
  return ctx.permissions.includes(key)
}

export function isMotoboy(ctx: Pick<SessionContext, "role"> | null | undefined): boolean {
  return ctx?.role === "MOTOBOY"
}

export function homeFor(role: Role): string {
  return role === "MOTOBOY" ? "/app/minhas-entregas" : "/app"
}
