/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils"

/**
 * Logotipo da empresa. Usa o arquivo oficial enviado em Configurações
 * (Supabase Storage, bucket "branding"); sem arquivo, exibe a marca textual.
 */
export function Logo({
  url,
  name = "OSSALA",
  size = "md",
  className,
}: {
  url?: string | null
  name?: string
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const box = size === "lg" ? "size-20" : size === "sm" ? "size-8" : "size-10"
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl"
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {url ? (
        <img src={url} alt={`Logotipo ${name}`} className={cn(box, "rounded-lg object-contain")} />
      ) : (
        <div
          className={cn(
            box,
            "bg-ossala-gradient flex items-center justify-center rounded-lg border border-[#d4af37]/50 font-black text-[#d4af37]",
            size === "lg" ? "text-2xl" : "text-sm",
          )}
          aria-hidden
        >
          O
        </div>
      )}
      <span className={cn(text, "font-extrabold tracking-[0.18em] text-[#d4af37]")}>{name.toUpperCase()}</span>
    </div>
  )
}
