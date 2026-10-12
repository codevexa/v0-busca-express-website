import { WifiOff } from "lucide-react"

export const dynamic = "force-static"

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#100b0d] px-6 text-center">
      <WifiOff className="size-10 text-[#d4af37]" />
      <h1 className="text-xl font-bold text-[#e8c98e]">Sem conexão</h1>
      <p className="max-w-sm text-sm text-[#b3a79c]">
        O OSSALA precisa de internet para consultar e salvar dados. Nenhuma operação foi registrada enquanto você estava offline.
        Assim que a conexão voltar, recarregue a página.
      </p>
      <a href="/app" className="rounded-md bg-[#800020] px-4 py-2 text-sm font-medium text-[#fdf7ea]">
        Tentar novamente
      </a>
    </div>
  )
}
