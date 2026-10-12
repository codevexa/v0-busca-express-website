/** Tipos e rótulos do domínio OSSALA (espelham as restrições do banco). */

export type Role = "ADMIN" | "GESTOR" | "ADMINISTRATIVO" | "MOTOBOY"

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  ADMINISTRATIVO: "Administrativo",
  MOTOBOY: "Motoboy",
}

export type DeliveryStatus = "pendente" | "em_andamento" | "entregue" | "cancelada"
export type PaymentStatus = "pendente" | "em_conferencia" | "aprovado" | "pago" | "cancelado"
export type ConferenceStatus =
  | "processando"
  | "aguardando_revisao"
  | "falha_ocr"
  | "aprovada"
  | "rejeitada"
  | "nova_foto_solicitada"
export type ClosingStatus = "aberto" | "consolidado" | "aprovado" | "encerrado" | "reaberto"
export type ExtraKind = "automatico" | "manual" | "ajuste" | "desconto"

export const DELIVERY_STATUS: Record<DeliveryStatus, { label: string; tone: Tone }> = {
  pendente: { label: "Pendente", tone: "warning" },
  em_andamento: { label: "Em andamento", tone: "info" },
  entregue: { label: "Concluída", tone: "success" },
  cancelada: { label: "Cancelada", tone: "muted" },
}

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pendente: { label: "Pendente", tone: "warning" },
  em_conferencia: { label: "Em conferência", tone: "info" },
  aprovado: { label: "Aprovado", tone: "gold" },
  pago: { label: "Pago", tone: "success" },
  cancelado: { label: "Cancelado", tone: "muted" },
}

export const CONFERENCE_STATUS: Record<ConferenceStatus, { label: string; tone: Tone }> = {
  processando: { label: "Processando", tone: "info" },
  aguardando_revisao: { label: "Aguardando revisão", tone: "warning" },
  falha_ocr: { label: "Falha no OCR", tone: "danger" },
  aprovada: { label: "Aprovada", tone: "success" },
  rejeitada: { label: "Rejeitada", tone: "danger" },
  nova_foto_solicitada: { label: "Nova foto solicitada", tone: "warning" },
}

export const CLOSING_STATUS: Record<ClosingStatus, { label: string; tone: Tone }> = {
  aberto: { label: "Aberto", tone: "muted" },
  consolidado: { label: "Consolidado", tone: "info" },
  aprovado: { label: "Aprovado", tone: "gold" },
  encerrado: { label: "Encerrado", tone: "success" },
  reaberto: { label: "Reaberto", tone: "warning" },
}

export const EXTRA_KIND: Record<ExtraKind, string> = {
  automatico: "Automático",
  manual: "Manual",
  ajuste: "Ajuste autorizado",
  desconto: "Desconto",
}

export type Tone = "success" | "warning" | "danger" | "info" | "muted" | "gold"

export interface SessionContext {
  user_id: string
  matricula: string
  nome: string
  email: string | null
  phone: string | null
  role: Role
  must_change_password: boolean
  company: { id: string; name: string; slug: string }
  motoboy_id: string | null
  permissions: string[]
}

export interface Area {
  id: string
  company_id: string
  name: string
  code: string | null
  color: string
  charge_amount: number
  repass_amount: number
  is_special: boolean
  active: boolean
  notes: string | null
  sort_order: number
}

export interface Neighborhood {
  id: string
  name: string
  city: string | null
  area_id: string | null
  active: boolean
}

export interface Motoboy {
  id: string
  name: string
  phone: string | null
  document: string | null
  vehicle: string | null
  plate: string | null
  pix_key: string | null
  notes: string | null
  active: boolean
  profile_id: string | null
}

export interface DeliveryRow {
  id: string
  company_id: string
  comanda_number: string
  delivery_date: string
  delivery_time: string
  address: string
  address_number: string | null
  complement: string | null
  neighborhood: string | null
  neighborhood_id: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  latitude: number | null
  longitude: number | null
  geocode_source: string | null
  motoboy_id: string | null
  area_id: string | null
  charge_amount: number
  repass_amount: number
  extras_charge_total: number
  extras_repass_total: number
  adjustments_total: number
  charge_total: number
  repass_gross: number
  repass_net: number
  status: DeliveryStatus
  payment_status: PaymentStatus
  has_divergence: boolean
  conference_status: "aguardando" | "aprovada" | "rejeitada" | "nova_foto" | null
  notes: string | null
  cancel_reason: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
  motoboy_name: string | null
  area_name: string | null
  area_color: string | null
}

export interface ExtraRow {
  id: string
  delivery_id: string
  rule_id: string | null
  kind: ExtraKind
  description: string
  charge_amount: number
  repass_amount: number
  created_at: string
  created_by: string | null
  canceled_at: string | null
  cancel_reason: string | null
}

export interface ExtraRule {
  id: string
  name: string
  description: string | null
  kind: "automatico" | "manual"
  charge_amount: number
  repass_amount: number
  conditions: {
    area_ids?: string[]
    neighborhood_ids?: string[]
    weekdays?: number[]
    start_time?: string
    end_time?: string
  }
  active: boolean
}

export interface AppSettings {
  company_id: string
  store_name: string | null
  store_address: string | null
  store_lat: number | null
  store_lng: number | null
  default_city: string | null
  default_state: string | null
  closing_split_day: number
  photo_retention_days: number
  pending_alert_minutes: number
  report_title: string
}

export interface NotificationRow {
  id: string
  category: string | null
  title: string
  message: string
  link: string | null
  read_at: string | null
  created_at: string
}
