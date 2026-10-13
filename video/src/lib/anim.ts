import { Easing, interpolate } from "remotion"

export const FPS = 30
export const sec = (s: number) => Math.round(s * FPS)

/** Curva padrão das animações de interface (desaceleração suave). */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1)

/** 0 → 1 entre `start` e `start + duration`, com easing e valores limitados. */
export function progress(frame: number, start: number, duration: number, easing = easeOut) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  })
}

/** Interpolação limitada com easing (atalho para keyframes). */
export function tween(frame: number, input: number[], output: number[], easing = easeInOut) {
  return interpolate(frame, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing })
}

/** Texto sendo digitado: `cps` caracteres por segundo a partir de `start`. */
export function typed(text: string, frame: number, start: number, cps = 18) {
  if (frame < start) return ""
  const n = Math.floor(((frame - start) / FPS) * cps)
  return text.slice(0, Math.max(0, Math.min(text.length, n)))
}

/** Cursor de digitação piscando enquanto o campo está em foco. */
export function caretVisible(frame: number) {
  return Math.floor(frame / 15) % 2 === 0
}

/** Número que conta de 0 até `to`. */
export function countUp(frame: number, start: number, duration: number, to: number) {
  return to * progress(frame, start, duration, Easing.out(Easing.cubic))
}

/** Entrada padrão de elementos: desliza de baixo com fade e leve desfoque. */
export function rise(frame: number, start: number, distance = 24, duration = 18) {
  const p = progress(frame, start, duration)
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * distance}px)`,
    filter: p < 1 ? `blur(${(1 - p) * 6}px)` : undefined,
  } as const
}

export type Point = { x: number; y: number }
export type CursorKey = { f: number; x: number; y: number; click?: boolean }

/** Posição do cursor por keyframes (movimento com easing entre cada ponto). */
export function cursorAt(frame: number, keys: CursorKey[]): Point {
  if (frame <= keys[0].f) return keys[0]
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]
    const b = keys[i]
    if (frame <= b.f) {
      const t = interpolate(frame, [a.f, b.f], [0, 1], { easing: easeInOut })
      // Arco suave para o movimento parecer humano.
      const arc = Math.sin(t * Math.PI) * Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.08)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - arc }
    }
  }
  return keys[keys.length - 1]
}

/** Frames de clique definidos nas keyframes do cursor. */
export function clickFrames(keys: CursorKey[]) {
  return keys.filter((k) => k.click).map((k) => k.f)
}
