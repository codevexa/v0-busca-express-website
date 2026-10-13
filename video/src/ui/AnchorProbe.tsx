import { useLayoutEffect, useRef } from "react"
import { getInputProps } from "remotion"
import { WIN_W } from "./AppShell"

/**
 * Ferramenta de desenvolvimento: com --props='{"measure":true}', registra no console
 * o centro de cada elemento com data-anchor (coordenadas da janela do app),
 * usado para posicionar o cursor com precisão sobre os componentes reais.
 */
export function AnchorProbe({ tag }: { tag: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const measure = Boolean((getInputProps() as { measure?: boolean }).measure)
  useLayoutEffect(() => {
    if (!measure || !ref.current) return
    const root = ref.current.closest("[data-window]") as HTMLElement | null
    if (!root) return
    const r = root.getBoundingClientRect()
    const k = r.width / WIN_W
    const out: Record<string, [number, number, number, number]> = {}
    root.querySelectorAll<HTMLElement>("[data-anchor], select[aria-label], input[aria-label]").forEach((el) => {
      const b = el.getBoundingClientRect()
      out[el.dataset.anchor ?? `${el.tagName.toLowerCase()}:${el.getAttribute("aria-label")}`] = [
        Math.round((b.left - r.left) / k + b.width / k / 2),
        Math.round((b.top - r.top) / k + b.height / k / 2),
        Math.round(b.width / k),
        Math.round(b.height / k),
      ]
    })
    console.log(`ANCHORS ${tag} ${JSON.stringify(out)}`)
  })
  return <span ref={ref} style={{ display: "none" }} />
}
