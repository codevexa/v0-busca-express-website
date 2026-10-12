"use client"

import { WifiOff } from "lucide-react"
import { useOnline } from "@/hooks/use-online"

export function NetworkStatus() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-600 px-3 py-1.5 text-sm font-medium text-black">
      <WifiOff className="size-4" />
      Sem conexão. As alterações não serão salvas até a internet voltar.
    </div>
  )
}
