import type React from "react"
import { AbsoluteFill } from "remotion"
import { WIN_H, WIN_W } from "./AppShell"

/** Escala base para a janela do app caber no quadro 1920x1080 com respiro. */
export const BASE_SCALE = 1.0

export interface CameraState {
  /** Ponto da janela (coordenadas do app) que fica no centro do quadro. */
  fx: number
  fy: number
  zoom: number
  rotX?: number
  rotY?: number
  /** Deslocamento vertical extra do quadro (px). */
  lift?: number
  opacity?: number
}

/**
 * "Câmera" virtual: centraliza e aproxima regiões da interface, com perspectiva
 * 3D sutil. A janela do app é renderizada no tamanho real e depois enquadrada.
 */
export function Camera({ state, children }: { state: CameraState; children: React.ReactNode }) {
  const { fx, fy, zoom, rotX = 0, rotY = 0, lift = 0, opacity = 1 } = state
  const s = zoom * BASE_SCALE
  return (
    <AbsoluteFill style={{ perspective: 2600, perspectiveOrigin: "50% 45%", opacity }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WIN_W,
          height: WIN_H,
          transformOrigin: `${fx}px ${fy}px`,
          // A origem fica no ponto focado: ele é escalado/rotacionado no lugar e levado ao centro do quadro.
          transform: `translate(${960 - fx}px, ${540 - fy + lift}px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${s})`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  )
}

/** Moldura da janela: cantos arredondados, borda fina dourada e sombra profunda. */
export function Window({ children, glow = 1 }: { children: React.ReactNode; glow?: number }) {
  return (
    <div
      data-window
      style={{
        width: WIN_W,
        height: WIN_H,
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(212,175,55,0.22)",
        boxShadow: `0 60px 140px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.6), 0 0 120px -20px rgba(128,0,32,${0.45 * glow})`,
        background: "#0b0b0b",
      }}
    >
      {children}
    </div>
  )
}
