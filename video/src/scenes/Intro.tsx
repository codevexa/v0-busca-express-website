import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion"
import { Backdrop } from "../ui/Backdrop"
import { easeInOut, progress } from "../lib/anim"

const WORDS = ["Gestão", "inteligente.", "Entregas", "sob", "controle."]

/** Cena 1 — Abertura: marca OSSALA (mesmo desenho do componente Logo) e frase de impacto. */
export function Intro({ duration }: { duration: number }) {
  const frame = useCurrentFrame()

  // Monograma: borda desenhada, preenchimento em gradiente e "O" dourado.
  const draw = progress(frame, 6, 34, easeInOut)
  const fill = progress(frame, 26, 22)
  const markScale = interpolate(frame, [6, 60], [0.86, 1], { extrapolateRight: "clamp", easing: easeInOut })
  const shine = interpolate(frame, [48, 84], [-120, 260], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // Palavra OSSALA com tracking abrindo.
  const word = progress(frame, 34, 30)
  const tracking = interpolate(word, [0, 1], [0.6, 0.18])

  // Subida geral do bloco da marca para dar lugar à frase.
  const lift = progress(frame, 70, 26, easeInOut)
  const outro = progress(frame, duration - 18, 18, easeInOut)

  const perimeter = 4 * 140
  return (
    <AbsoluteFill>
      <Backdrop frame={frame} intensity={0.6 + 0.4 * fill} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: 1 - outro,
          transform: `scale(${1 + outro * 0.06})`,
          filter: outro > 0 ? `blur(${outro * 10}px)` : undefined,
        }}
      >
        <div style={{ transform: `translateY(${-70 * lift}px)`, display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ position: "relative", width: 140, height: 140, transform: `scale(${markScale})` }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 26,
                backgroundImage: "linear-gradient(135deg, #800020 0%, #4a0012 100%)",
                opacity: fill,
                boxShadow: `0 30px 90px -10px rgba(128,0,32,${0.7 * fill}), 0 0 0 1px rgba(212,175,55,${0.5 * fill})`,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -40,
                  bottom: -40,
                  width: 60,
                  left: shine,
                  transform: "rotate(20deg)",
                  background: "linear-gradient(90deg, transparent, rgba(255,240,200,0.35), transparent)",
                }}
              />
            </div>
            <svg width={140} height={140} style={{ position: "absolute", inset: 0 }}>
              <rect
                x={1}
                y={1}
                width={138}
                height={138}
                rx={26}
                fill="none"
                stroke="#d4af37"
                strokeOpacity={0.9}
                strokeWidth={2}
                strokeDasharray={perimeter}
                strokeDashoffset={perimeter * (1 - draw)}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#d4af37",
                fontSize: 76,
                fontWeight: 900,
                opacity: fill,
                transform: `scale(${0.7 + 0.3 * fill})`,
              }}
            >
              O
            </div>
          </div>
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontSize: 104,
                fontWeight: 800,
                color: "#d4af37",
                letterSpacing: `${tracking}em`,
                opacity: word,
                transform: `translateX(${(1 - word) * -30}px)`,
                filter: word < 1 ? `blur(${(1 - word) * 12}px)` : undefined,
                backgroundImage: "linear-gradient(180deg, #f1d98a 0%, #d4af37 55%, #b48a4a 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              OSSALA
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 22,
                letterSpacing: "0.42em",
                textTransform: "uppercase",
                color: "#b3a79c",
                opacity: progress(frame, 52, 20),
              }}
            >
              Controle de Entregas
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", top: "50%", marginTop: 110, display: "flex", gap: 18 }}>
          {WORDS.map((w, i) => {
            const p = progress(frame, 84 + i * 5, 22)
            const gold = i >= 2
            return (
              <span
                key={w}
                style={{
                  fontSize: 46,
                  fontWeight: gold ? 700 : 400,
                  color: gold ? "#e8c98e" : "#f3eee6",
                  opacity: p,
                  transform: `translateY(${(1 - p) * 22}px)`,
                  filter: p < 1 ? `blur(${(1 - p) * 10}px)` : undefined,
                  letterSpacing: "-0.01em",
                }}
              >
                {w}
              </span>
            )
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
