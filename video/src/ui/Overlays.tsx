import { CheckCircle2, ChevronDown, XIcon } from "lucide-react"
import type React from "react"
import { interpolate } from "remotion"
import { cn } from "@/lib/utils"
import { progress } from "../lib/anim"
import { WIN_H, WIN_W } from "./AppShell"

/**
 * Réplica estática do DialogContent/DialogOverlay de components/ui/dialog.tsx
 * (mesmas classes), com a animação de abertura fade + zoom-in-95 controlada por frame.
 */
export function DialogFrame({
  frame,
  openAt,
  closeAt,
  className,
  children,
  showClose = true,
  scroll,
}: {
  frame: number
  openAt: number
  closeAt?: number
  className?: string
  children: React.ReactNode
  showClose?: boolean
  /** Rolagem interna (o DialogContent real tem max-h-[92dvh] com overflow-y-auto). */
  scroll?: number
}) {
  const pin = progress(frame, openAt, 10)
  const pout = closeAt === undefined ? 0 : progress(frame, closeAt, 8)
  const p = pin * (1 - pout)
  if (p <= 0) return null
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: WIN_W, height: WIN_H, zIndex: 50 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" style={{ opacity: p }} />
      <div
        className={cn(
          "ossala absolute top-1/2 left-1/2 grid max-h-[92%] w-[calc(100%-1.5rem)] max-w-lg gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl outline-none",
          scroll === undefined ? "overflow-visible" : "overflow-hidden",
          className,
        )}
        style={{ opacity: p, transform: `translate(-50%, -50%) scale(${0.95 + 0.05 * p})` }}
      >
        {scroll === undefined ? children : <div className="grid gap-4" style={{ transform: `translateY(${-scroll}px)` }}>{children}</div>}
        {showClose && (
          <span className="absolute top-4 right-4 rounded-sm opacity-70">
            <XIcon className="size-4" />
          </span>
        )}
      </div>
    </div>
  )
}

/** Toast de sucesso no estilo do Sonner (theme="dark", richColors, position="top-center"). */
export function Toast({ frame, at, text, duration = 70 }: { frame: number; at: number; text: string; duration?: number }) {
  const pin = progress(frame, at, 12)
  const pout = progress(frame, at + duration, 10)
  const p = pin * (1 - pout)
  if (p <= 0) return null
  return (
    <div
      style={{
        position: "absolute",
        top: 28,
        left: WIN_W / 2,
        zIndex: 120,
        width: 356,
        transform: `translate(-50%, ${(1 - pin) * -24}px)`,
        opacity: p,
        background: "hsl(150, 100%, 6%)",
        border: "1px solid hsl(147, 100%, 12%)",
        color: "hsl(150, 86%, 65%)",
        borderRadius: 8,
        padding: "14px 16px",
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
      }}
    >
      <CheckCircle2 className="size-5" />
      {text}
    </div>
  )
}

/**
 * Campo com aparência de foco (as mesmas classes de focus-visible do Input/NativeSelect),
 * para simular o campo ativo durante a digitação.
 */
export const FOCUS = "border-ring ring-[3px] ring-ring/40"

/** Campo de texto estático com o visual exato do Input do app. */
export function FakeInput({
  value,
  placeholder,
  focused,
  caret,
  className,
  icon,
}: {
  value: string
  placeholder?: string
  focused?: boolean
  caret?: boolean
  className?: string
  icon?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative flex h-10 w-full min-w-0 items-center rounded-md border border-input bg-input/20 px-3 py-2 text-sm text-foreground shadow-xs",
        focused && FOCUS,
        icon ? "pl-9" : "",
        className,
      )}
    >
      {icon && <span className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">{icon}</span>}
      {value ? <span className="whitespace-nowrap">{value}</span> : <span className="whitespace-nowrap text-muted-foreground">{placeholder}</span>}
      {focused && caret && <span className="ml-px inline-block h-4 w-px bg-[#e8c98e]" />}
    </div>
  )
}

/** Select com o visual exato do NativeSelect do app. */
export function FakeSelect({ value, focused, className, muted }: { value: string; focused?: boolean; className?: string; muted?: boolean }) {
  return (
    <div className="relative w-full">
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-input/20 py-2 pr-9 pl-3 text-sm shadow-xs",
          focused && FOCUS,
          muted && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{value}</span>
      </div>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/** Lista de opções aberta (representa o menu nativo do <select>). */
export function OptionsMenu({
  frame,
  openAt,
  closeAt,
  options,
  highlighted,
  width,
}: {
  frame: number
  openAt: number
  closeAt: number
  options: string[]
  highlighted: number
  width: number
}) {
  const p = progress(frame, openAt, 8) * (1 - progress(frame, closeAt, 6))
  if (p <= 0) return null
  return (
    <div
      className="absolute z-40 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-2xl"
      style={{
        width,
        top: 44,
        left: 0,
        opacity: p,
        transform: `translateY(${(1 - p) * -6}px)`,
        transformOrigin: "top",
      }}
    >
      {options.map((o, i) => (
        <div key={o} className={cn("px-3 py-1.5", i === highlighted && "bg-[#800020] text-[#fdf7ea]")}>
          {o}
        </div>
      ))}
    </div>
  )
}

/** Destaque dourado temporário (linha recém-criada ou valor alterado). */
export function flash(frame: number, at: number, duration = 40) {
  return interpolate(frame, [at, at + 6, at + duration], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
}
