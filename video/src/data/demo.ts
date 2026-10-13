/**
 * Dados DEMONSTRATIVOS e FICTÍCIOS usados no vídeo.
 * Nenhum dado real de clientes, motoboys, senhas ou chaves é utilizado.
 * Os tipos são os mesmos do aplicativo (lib/domain.ts).
 */
import { formatDateBR, todayISO } from "@/lib/dates"
import type { Area, DeliveryRow, DeliveryStatus, Motoboy, PaymentStatus, Role } from "@/lib/domain"

export const COMPANY = "OSSALA"
/** As telas usam a data do dia, como no app (filtro "Hoje"). */
export const DEMO_DATE = todayISO()
const D = formatDateBR(DEMO_DATE)

export const SESSION_USER = { nome: "Ana Ribeiro", role: "ADMIN" as Role, matricula: "1001" }

export const AREAS: Area[] = [
  area("a1", "Centro", "#e8c98e", 7, 5),
  area("a2", "Zona Norte", "#a78bfa", 9, 6.5),
  area("a3", "Zona Sul", "#f472b6", 10, 7),
  area("a4", "Zona Leste", "#34d399", 12, 8.5),
  area("a5", "Distante (especial)", "#fb923c", 18, 13),
]

export const MOTOBOYS: Motoboy[] = ["Carlos Mendes", "Rafael Souza", "Diego Lima", "Bruno Alves", "Marcos Pereira"].map(
  (name, i) => ({
    id: `m${i + 1}`,
    name,
    phone: null,
    document: null,
    vehicle: "Moto",
    plate: null,
    pix_key: null,
    notes: null,
    active: true,
    profile_id: null,
  }),
)

const areaById = Object.fromEntries(AREAS.map((a) => [a.id, a]))
const motoboyById = Object.fromEntries(MOTOBOYS.map((m) => [m.id, m]))

type Seed = [
  comanda: string,
  time: string,
  address: string,
  number: string,
  neighborhood: string,
  areaId: string,
  motoboyId: string | null,
  status: DeliveryStatus,
  payment: PaymentStatus,
  /** Posição relativa no mapa ilustrativo (0..1). */
  pos: [number, number],
  divergence?: boolean,
]

const SEEDS: Seed[] = [
  ["4834", "19:52", "Av. Brasil", "1450", "Vila Nova", "a2", "m3", "em_andamento", "pendente", [0.57, 0.2]],
  ["4833", "19:47", "Rua Sete de Setembro", "88", "Centro", "a1", "m1", "entregue", "pendente", [0.47, 0.44]],
  ["4832", "19:41", "Rua Ipê Amarelo", "32", "Parque das Flores", "a4", "m4", "entregue", "pendente", [0.8, 0.52]],
  ["4831", "19:36", "Travessa São Jorge", "15", "Boa Vista", "a3", "m2", "entregue", "em_conferencia", [0.36, 0.74]],
  ["4830", "19:30", "Rua Dom Pedro II", "410", "Centro", "a1", "m5", "entregue", "pendente", [0.55, 0.53], true],
  ["4829", "19:22", "Av. Independência", "2300", "Santa Rita", "a5", "m3", "em_andamento", "pendente", [0.9, 0.16]],
  ["4828", "19:15", "Rua Bela Vista", "77", "Jardim Europa", "a3", "m1", "entregue", "aprovado", [0.26, 0.62]],
  ["4827", "19:08", "Rua das Acácias", "260", "Vila Nova", "a2", null, "pendente", "pendente", [0.66, 0.3]],
  ["4826", "19:01", "Rua Quinze de Novembro", "19", "Centro", "a1", "m2", "entregue", "pago", [0.42, 0.36]],
  ["4825", "18:54", "Rua dos Girassóis", "540", "Parque das Flores", "a4", "m4", "entregue", "pago", [0.73, 0.66]],
  ["4824", "18:46", "Av. Paulista Nova", "905", "Jardim Europa", "a3", "m5", "entregue", "pago", [0.18, 0.47]],
]

export const DELIVERIES: DeliveryRow[] = SEEDS.map(seedToRow)

/** Entrega cadastrada durante a demonstração (cena "Gestão de entregas"). */
export const NEW_DELIVERY = {
  comanda: "4835",
  address: "Rua das Palmeiras",
  number: "120",
  complement: "Apto 32",
  neighborhood: "Jardim Europa",
  city: "São Paulo",
  state: "SP",
  areaId: "a3",
  motoboyId: "m2",
  time: "19:58",
  pos: [0.3, 0.55] as [number, number],
}

export function newDeliveryRow(status: DeliveryStatus): DeliveryRow {
  const n = NEW_DELIVERY
  return seedToRow([n.comanda, n.time, n.address, n.number, n.neighborhood, n.areaId, n.motoboyId, status, "pendente", n.pos])
}

/** Posição relativa no mapa ilustrativo, por id da entrega. */
export const MAP_POS: Record<string, [number, number]> = Object.fromEntries([
  ...SEEDS.map((s) => [`d${s[0]}`, s[9]] as const),
  [`d${NEW_DELIVERY.comanda}`, NEW_DELIVERY.pos] as const,
])
export const STORE_POS: [number, number] = [0.5, 0.48]

function seedToRow(s: Seed): DeliveryRow {
  const [comanda, time, address, number, neighborhood, areaId, motoboyId, status, payment, , divergence] = s
  const a = areaById[areaId]
  return {
    id: `d${comanda}`,
    company_id: "demo",
    comanda_number: comanda,
    delivery_date: DEMO_DATE,
    delivery_time: `${time}:00`,
    address,
    address_number: number,
    complement: null,
    neighborhood,
    neighborhood_id: null,
    city: "São Paulo",
    state: "SP",
    postal_code: null,
    latitude: 1,
    longitude: 1,
    geocode_source: "nominatim",
    motoboy_id: motoboyId,
    area_id: areaId,
    charge_amount: a.charge_amount,
    repass_amount: a.repass_amount,
    extras_charge_total: 0,
    extras_repass_total: 0,
    adjustments_total: 0,
    charge_total: a.charge_amount,
    repass_gross: a.repass_amount,
    repass_net: a.repass_amount,
    status,
    payment_status: payment,
    has_divergence: !!divergence,
    conference_status: null,
    notes: null,
    cancel_reason: null,
    delivered_at: null,
    created_at: `${DEMO_DATE}T${time}:00-03:00`,
    updated_at: `${DEMO_DATE}T${time}:00-03:00`,
    motoboy_name: motoboyId ? motoboyById[motoboyId].name : null,
    area_name: a.name,
    area_color: a.color,
  }
}

function area(id: string, name: string, color: string, charge: number, repass: number): Area {
  return {
    id,
    company_id: "demo",
    name,
    code: null,
    color,
    charge_amount: charge,
    repass_amount: repass,
    is_special: id === "a5",
    active: true,
    notes: null,
    sort_order: 0,
  }
}

/** Indicadores do painel "Hoje" (mesmos campos de dashboard_summary). */
export const SUMMARY = {
  total: 48,
  comandas: 48,
  pendentes: 6,
  em_andamento: 9,
  concluidas: 31,
  canceladas: 2,
  divergencias: 1,
  conferencias_aguardando: 3,
  extras_qtd: 5,
  charge_total: 452,
  repass_total: 318.5,
  pagamentos_pendentes_valor: 318.5,
  pagamentos_pendentes_qtd: 31,
  por_motoboy: [
    { nome: "Carlos Mendes", total: 12, concluidas: 9, repasse: 61 },
    { nome: "Rafael Souza", total: 11, concluidas: 8, repasse: 58 },
    { nome: "Diego Lima", total: 9, concluidas: 5, repasse: 46.5 },
    { nome: "Bruno Alves", total: 8, concluidas: 6, repasse: 51 },
    { nome: "Marcos Pereira", total: 6, concluidas: 3, repasse: 30.5 },
  ],
  por_area: [
    { nome: "Centro", cor: "#e8c98e", total: 17, cobrado: 119 },
    { nome: "Zona Sul", cor: "#f472b6", total: 11, cobrado: 110 },
    { nome: "Zona Norte", cor: "#a78bfa", total: 9, cobrado: 81 },
    { nome: "Zona Leste", cor: "#34d399", total: 6, cobrado: 72 },
    { nome: "Distante (especial)", cor: "#fb923c", total: 3, cobrado: 54 },
  ],
}

/** Usuários fictícios (tela Usuários). */
export const USERS: Array<{ nome: string; matricula: string; role: Role; ativo: boolean; last: string | null; pending?: boolean }> = [
  { nome: "Ana Ribeiro", matricula: "1001", role: "ADMIN", ativo: true, last: `${D} 19:40` },
  { nome: "Bruno Alves", matricula: "3004", role: "MOTOBOY", ativo: true, last: `${D} 19:12` },
  { nome: "Carlos Mendes", matricula: "3001", role: "MOTOBOY", ativo: true, last: `${D} 19:47` },
  { nome: "Fernanda Lopes", matricula: "1002", role: "GESTOR", ativo: true, last: `${D} 18:05` },
  { nome: "Juliana Costa", matricula: "2001", role: "ADMINISTRATIVO", ativo: true, last: `${D} 17:58` },
  { nome: "Paulo Henrique", matricula: "2002", role: "ADMINISTRATIVO", ativo: false, last: null },
  { nome: "Rafael Souza", matricula: "3002", role: "MOTOBOY", ativo: true, last: `${D} 19:31`, pending: true },
]

/**
 * Permissões padrão por função, copiadas da migration
 * supabase/migrations/20261012000850_replace_legacy_rules.sql (ADMIN tem acesso total).
 */
export const ROLE_DEFAULTS: Record<"GESTOR" | "ADMINISTRATIVO" | "MOTOBOY", string[]> = {
  GESTOR: [
    "dashboard.visualizar", "entregas.visualizar", "entregas.criar", "entregas.editar", "entregas.excluir",
    "entregas.atribuir", "entregas.confirmar", "entregas.corrigir_confirmacao", "entregas.exportar",
    "motoboys.visualizar", "motoboys.criar", "motoboys.editar", "areas.visualizar", "areas.editar",
    "extras.visualizar", "extras.criar", "extras.editar", "financeiro.visualizar", "financeiro.ajustar",
    "pagamentos.visualizar", "pagamentos.criar", "pagamentos.aprovar", "pagamentos.confirmar",
    "fechamentos.visualizar", "fechamentos.criar", "fechamentos.aprovar", "fechamentos.confirmar",
    "mapa.visualizar", "mapa.editar", "fotos.visualizar", "fotos.criar", "conferencia.visualizar",
    "conferencia.criar", "conferencia.aprovar", "relatorios.visualizar", "relatorios.exportar",
    "alertas.visualizar", "usuarios.visualizar", "auditoria.visualizar",
  ],
  ADMINISTRATIVO: [
    "dashboard.visualizar", "entregas.visualizar", "entregas.criar", "entregas.editar", "entregas.atribuir",
    "entregas.exportar", "motoboys.visualizar", "areas.visualizar", "extras.visualizar", "extras.criar",
    "financeiro.visualizar", "pagamentos.visualizar", "pagamentos.criar", "fechamentos.visualizar",
    "mapa.visualizar", "mapa.editar", "fotos.visualizar", "fotos.criar", "conferencia.visualizar",
    "conferencia.criar", "relatorios.visualizar", "relatorios.exportar", "alertas.visualizar",
  ],
  MOTOBOY: [
    "entregas.visualizar", "entregas.confirmar", "mapa.visualizar", "fotos.criar", "fotos.visualizar",
    "conferencia.criar", "conferencia.visualizar", "alertas.visualizar",
  ],
}

/** Trecho do catálogo de permissões (migration 0002), módulos Pagamentos e Conferência. */
export const PERMISSION_SAMPLE = [
  { module: "Pagamentos", key: "pagamentos.visualizar", label: "Visualizar pagamentos" },
  { module: "Pagamentos", key: "pagamentos.criar", label: "Gerar pagamentos" },
  { module: "Pagamentos", key: "pagamentos.aprovar", label: "Aprovar pagamentos" },
  { module: "Pagamentos", key: "pagamentos.confirmar", label: "Registrar pagamento efetuado" },
  { module: "Conferência", key: "conferencia.visualizar", label: "Visualizar conferências" },
  { module: "Conferência", key: "conferencia.criar", label: "Iniciar conferência por foto" },
  { module: "Conferência", key: "conferencia.aprovar", label: "Aprovar / rejeitar conferência" },
]
