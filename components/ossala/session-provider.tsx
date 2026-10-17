"use client"

import { createContext, useCallback, useContext } from "react"
import type { AppSettings, SessionContext } from "@/lib/domain"
import { can } from "@/lib/permissions"

interface Ctx {
  session: SessionContext
  settings: AppSettings | null
  logoUrl: string | null
}

const SessionCtx = createContext<Ctx | null>(null)

export function SessionProvider({ value, children }: { value: Ctx; children: React.ReactNode }) {
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export function useSession() {
  const ctx = useContext(SessionCtx)
  if (!ctx) throw new Error("useSession fora do SessionProvider")
  return ctx
}

/**
 * Função de checagem de permissão com identidade estável enquanto a sessão
 * não muda. Ela entra em dependências de useCallback/useEffect; uma função
 * nova a cada renderização faria as telas recarregarem em laço.
 */
export function useCan() {
  const { session } = useSession()
  return useCallback((key: string) => can(session, key), [session])
}
