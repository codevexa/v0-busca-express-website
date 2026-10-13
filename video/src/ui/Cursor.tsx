import { interpolate } from "remotion"
import { clickFrames, cursorAt, type CursorKey } from "../lib/anim"

/**
 * Cursor animado por keyframes, com "pressão" e onda no clique.
 * Coordenadas na janela do app. `scale` compensa o zoom da câmera.
 */
export function Cursor({ frame, keys, scale = 1, visibleFrom = 0, hideAfter }: {
  frame: number
  keys: CursorKey[]
  scale?: number
  visibleFrom?: number
  hideAfter?: number
}) {
  const { x, y } = cursorAt(frame, keys)
  const clicks = clickFrames(keys)
  const last = clicks.filter((c) => c <= frame).pop()
  const since = last === undefined ? 999 : frame - last
  const press = since < 6 ? interpolate(since, [0, 2, 6], [1, 0.82, 1]) : 1
  const ripple = since < 18 ? since / 18 : null
  let opacity = interpolate(frame, [visibleFrom, visibleFrom + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  if (hideAfter !== undefined) opacity *= interpolate(frame, [hideAfter, hideAfter + 8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  return (
    <div style={{ position: "absolute", left: 0, top: 0, zIndex: 100, pointerEvents: "none", opacity }}>
      {ripple !== null && (
        <div
          style={{
            position: "absolute",
            left: x - 24 * scale,
            top: y - 24 * scale,
            width: 48 * scale,
            height: 48 * scale,
            borderRadius: 999,
            border: `${2 * scale}px solid rgba(212,175,55,${0.9 * (1 - ripple)})`,
            background: `rgba(212,175,55,${0.18 * (1 - ripple)})`,
            transform: `scale(${0.3 + ripple * 1.1})`,
          }}
        />
      )}
      <svg
        width={26 * scale}
        height={30 * scale}
        viewBox="0 0 26 30"
        style={{
          position: "absolute",
          left: x - 3 * scale,
          top: y - 2 * scale,
          transform: `scale(${press})`,
          transformOrigin: "3px 2px",
          filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.55))",
        }}
      >
        <path d="M3 2 L3 24 L9 18.5 L13 27.5 L17 25.8 L13 17 L21 17 Z" fill="#f3eee6" stroke="#0b0b0b" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
