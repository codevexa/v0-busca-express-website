import type React from "react"
import { SessionProvider } from "@/components/ossala/session-provider"
import type { AppSettings, SessionContext } from "@/lib/domain"
import { COMPANY, SESSION_USER } from "../data/demo"

const session: SessionContext = {
  user_id: "demo-user",
  matricula: SESSION_USER.matricula,
  nome: SESSION_USER.nome,
  email: null,
  phone: null,
  role: SESSION_USER.role,
  must_change_password: false,
  company: { id: "demo", name: COMPANY, slug: "ossala" },
  motoboy_id: null,
  permissions: [],
}

const settings: AppSettings = {
  company_id: "demo",
  store_name: COMPANY,
  store_address: null,
  store_lat: null,
  store_lng: null,
  default_city: "São Paulo",
  default_state: "SP",
  closing_split_day: 15,
  photo_retention_days: 90,
  pending_alert_minutes: 30,
  report_title: "OSSALA",
}

/** O mesmo SessionProvider do app, com uma sessão fictícia de Administrador (sem acesso a banco). */
export function DemoSession({ children }: { children: React.ReactNode }) {
  return <SessionProvider value={{ session, settings, logoUrl: null }}>{children}</SessionProvider>
}
