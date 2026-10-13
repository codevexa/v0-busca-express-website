import { AbsoluteFill, interpolate } from "remotion"
import { easeInOut, progress } from "../lib/anim"

/**
 * Legenda de capítulo (terço inferior): número, título e uma linha de descrição.
 * Entra e sai sozinha dentro da duração da cena.
 */
export function SceneLabel({
  frame,
  duration,
  index,
  title,
  subtitle,
  from = 10,
  until,
}: {
  frame: number
  duration: number
  index: string
  title: string
  subtitle: string
  from?: number
  /** Frame em que a legenda começa a sair (padrão: fim da cena). */
  until?: number
}) {
  const inP = progress(frame, from, 22)
  const outP = interpolate(frame, [(until ?? duration - 8) - 18, until ?? duration - 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut })
  const opacity = inP * (1 - outP)
  const line = progress(frame, from + 4, 30)
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 72,
          bottom: 64,
          opacity,
          transform: `translateY(${(1 - inP) * 18}px)`,
          filter: inP < 1 ? `blur(${(1 - inP) * 8}px)` : undefined,
        }}
      >
        <div
          className="ossala"
          style={{
            background: "transparent",
            padding: "20px 28px 22px",
            borderRadius: 16,
            backgroundColor: "rgba(16,11,13,0.78)",
            border: "1px solid rgba(212,175,55,0.25)",
            boxShadow: "0 30px 60px -20px rgba(0,0,0,0.8)",
            backdropFilter: "blur(14px)",
            minWidth: 440,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: "Geist Mono", fontSize: 15, color: "#d4af37", letterSpacing: "0.12em" }}>{index}</span>
            <span style={{ height: 1, width: 60 * line, background: "linear-gradient(90deg,#d4af37,transparent)" }} />
          </div>
          <div style={{ marginTop: 8, fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em", color: "#f3eee6" }}>{title}</div>
          <div style={{ marginTop: 6, fontSize: 18, color: "#b3a79c" }}>{subtitle}</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: 72,
          bottom: 64,
          opacity: opacity * 0.75,
          fontSize: 13,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "#b48a4a",
        }}
      >
        Dados fictícios · demonstração
      </div>
    </AbsoluteFill>
  )
}
