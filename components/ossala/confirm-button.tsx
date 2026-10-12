"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * Botão com confirmação para ações críticas. Opcionalmente exige justificativa.
 * O diálogo só fecha quando a ação termina com sucesso.
 */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
  variant = "default",
  size = "default",
  reasonLabel,
  reasonMinLength = 0,
  disabled,
  className,
}: {
  children: React.ReactNode
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  onConfirm: (reason: string) => Promise<boolean | void>
  variant?: React.ComponentProps<typeof Button>["variant"]
  size?: React.ComponentProps<typeof Button>["size"]
  reasonLabel?: string
  reasonMinLength?: number
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [reason, setReason] = useState("")
  const reasonOk = !reasonLabel || reason.trim().length >= reasonMinLength

  async function handle() {
    if (pending || !reasonOk) return
    setPending(true)
    try {
      const ok = await onConfirm(reason.trim())
      if (ok !== false) {
        setOpen(false)
        setReason("")
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} className={className} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription asChild><div>{description}</div></AlertDialogDescription>}
          </AlertDialogHeader>
          {reasonLabel && (
            <div className="grid gap-2">
              <Label htmlFor="confirm-reason">{reasonLabel}</Label>
              <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
              {reasonMinLength > 0 && (
                <span className="text-xs text-muted-foreground">Mínimo de {reasonMinLength} caracteres.</span>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button variant={variant === "outline" || variant === "ghost" ? "default" : variant} onClick={handle} disabled={pending || !reasonOk}>
              {pending && <Loader2 className="animate-spin" />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
