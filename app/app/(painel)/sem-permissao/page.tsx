import { ShieldX } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { requireContext } from "@/lib/auth"
import { homeFor } from "@/lib/permissions"

export default async function SemPermissaoPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const [ctx, { p }] = await Promise.all([requireContext(), searchParams])
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <ShieldX className="size-10 text-[#800020]" />
      <h1 className="text-xl font-bold text-[#e8c98e]">Acesso não autorizado</h1>
      <p className="text-sm text-muted-foreground">
        Seu usuário não tem permissão para esta área{p ? ` (${p})` : ""}. Se precisar de acesso, fale com o administrador.
      </p>
      <Button asChild>
        <Link href={homeFor(ctx.role)}>Voltar ao início</Link>
      </Button>
    </div>
  )
}
