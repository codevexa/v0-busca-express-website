"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/**
 * Registra o service worker do PWA. Ele só guarda arquivos estáticos e a tela
 * offline — nunca dados financeiros, respostas da API ou credenciais.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return
    let refreshing = false
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        const promptUpdate = (worker: ServiceWorker) => {
          toast("Nova versão disponível", {
            description: "Atualize para usar a versão mais recente do OSSALA.",
            duration: Infinity,
            action: { label: "Atualizar", onClick: () => worker.postMessage({ type: "SKIP_WAITING" }) },
          })
        }
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting)
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) promptUpdate(worker)
          })
        })
      })
      .catch(() => {
        // Sem service worker o app continua funcionando normalmente online.
      })
  }, [])
  return null
}
