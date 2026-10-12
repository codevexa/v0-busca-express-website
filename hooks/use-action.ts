"use client"

import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"
import type { ActionResult } from "@/lib/errors"

/**
 * Executa uma ação de servidor com proteção contra cliques repetidos,
 * indicador de carregamento e mensagem de resultado real.
 */
export function useAction<A extends unknown[], T>(
  action: (...args: A) => Promise<ActionResult<T>>,
  opts: { success?: string | ((data: T) => string); onSuccess?: (data: T) => void; silent?: boolean } = {},
) {
  const [pending, setPending] = useState(false)
  const running = useRef(false)

  const run = useCallback(
    async (...args: A): Promise<ActionResult<T>> => {
      if (running.current) return { ok: false, error: "Operação em andamento." }
      running.current = true
      setPending(true)
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const result = { ok: false as const, error: "Sem conexão com a internet. Nada foi salvo; tente novamente quando a conexão voltar." }
          toast.error(result.error)
          return result
        }
        const result = await action(...args)
        if (result.ok) {
          const msg = typeof opts.success === "function" ? opts.success(result.data) : (opts.success ?? result.message)
          if (msg && !opts.silent) toast.success(msg)
          opts.onSuccess?.(result.data)
        } else if (!opts.silent) {
          toast.error(result.error)
        }
        return result
      } catch (error) {
        const message =
          error instanceof Error && /fetch|network/i.test(error.message)
            ? "Falha de conexão. Nada foi salvo; tente novamente."
            : "Não foi possível concluir a operação. Tente novamente."
        if (!opts.silent) toast.error(message)
        return { ok: false, error: message }
      } finally {
        running.current = false
        setPending(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action],
  )

  return { run, pending }
}
