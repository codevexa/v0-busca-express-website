"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { useSession } from "@/components/ossala/session-provider"

/** Força a troca da senha provisória definida pelo administrador. */
export function PasswordChangeGuard() {
  const { session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  useEffect(() => {
    if (session.must_change_password && pathname !== "/app/perfil") {
      router.replace("/app/perfil?trocar-senha=1")
    }
  }, [session.must_change_password, pathname, router])
  return null
}
