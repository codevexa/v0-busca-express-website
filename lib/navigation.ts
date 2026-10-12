import {
  Bell,
  BookOpenCheck,
  Calculator,
  CalendarDays,
  Camera,
  ClipboardList,
  FileBarChart2,
  History,
  LayoutDashboard,
  Map,
  MapPinned,
  PackageCheck,
  ScanSearch,
  Settings,
  ShieldCheck,
  Users,
  Bike,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { P } from "@/lib/permissions"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Qualquer uma das permissões libera o item. */
  anyOf: string[]
  /** Item exibido somente para MOTOBOY (true) ou somente para equipe interna (false). */
  motoboy?: boolean
  group: "operacao" | "consulta" | "financeiro" | "administracao"
  mobilePrimary?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Hoje", icon: LayoutDashboard, anyOf: [P.dashboard], motoboy: false, group: "operacao", mobilePrimary: true },
  { href: "/app/minhas-entregas", label: "Minhas entregas", icon: PackageCheck, anyOf: [P.entregasConfirmar], motoboy: true, group: "operacao", mobilePrimary: true },
  { href: "/app/entregas", label: "Entregas", icon: ClipboardList, anyOf: [P.entregasVer], motoboy: false, group: "operacao", mobilePrimary: true },
  { href: "/app/mapa", label: "Mapa", icon: Map, anyOf: [P.mapaVer], group: "operacao", mobilePrimary: true },
  { href: "/app/fotos", label: "Fotos de comandas", icon: Camera, anyOf: [P.fotosCriar, P.fotosVer], group: "operacao", mobilePrimary: true },
  { href: "/app/conferencia", label: "Conferência", icon: ScanSearch, anyOf: [P.conferenciaVer], motoboy: false, group: "operacao" },
  { href: "/app/historico", label: "Histórico", icon: History, anyOf: [P.entregasVer], motoboy: false, group: "consulta" },
  { href: "/app/calendario", label: "Calendário", icon: CalendarDays, anyOf: [P.entregasVer], motoboy: false, group: "consulta" },
  { href: "/app/relatorios", label: "Relatórios", icon: FileBarChart2, anyOf: [P.relatoriosVer], motoboy: false, group: "consulta" },
  { href: "/app/alertas", label: "Alertas", icon: Bell, anyOf: [P.alertasVer], group: "consulta" },
  { href: "/app/pagamentos", label: "Pagamentos", icon: Wallet, anyOf: [P.pagamentosVer], motoboy: false, group: "financeiro" },
  { href: "/app/fechamentos", label: "Fechamentos", icon: Calculator, anyOf: [P.fechamentosVer], motoboy: false, group: "financeiro" },
  { href: "/app/motoboys", label: "Motoboys", icon: Bike, anyOf: [P.motoboysVer], motoboy: false, group: "administracao" },
  { href: "/app/areas", label: "Áreas e cobrança", icon: MapPinned, anyOf: [P.areasVer], motoboy: false, group: "administracao" },
  { href: "/app/usuarios", label: "Usuários", icon: Users, anyOf: [P.usuariosVer], motoboy: false, group: "administracao" },
  { href: "/app/auditoria", label: "Auditoria", icon: ShieldCheck, anyOf: [P.auditoria], motoboy: false, group: "administracao" },
  { href: "/app/configuracoes", label: "Configurações", icon: Settings, anyOf: [P.configuracoes], motoboy: false, group: "administracao" },
  { href: "/app/ajuda", label: "Ajuda", icon: BookOpenCheck, anyOf: [], group: "administracao" },
]

export const NAV_GROUP_LABELS: Record<NavItem["group"], string> = {
  operacao: "Operação",
  consulta: "Consulta",
  financeiro: "Financeiro",
  administracao: "Administração",
}
