import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion"
import { easeInOut, progress } from "../lib/anim"
import { AppShell } from "../ui/AppShell"
import { Backdrop } from "../ui/Backdrop"
import { Window } from "../ui/Camera"
import { ConferencePage } from "./Conference"
import { MapPage } from "./MapScene"
import { DashboardScreen } from "./Overview"

/** Telas reunidas na composição final (estado final de cada cena). */
const SHOTS = [
  { key: "map", active: "/app/mapa", render: () => <MapPage frame={100} />, x: -600, y: 40, z: -200, rotY: 22, scale: 0.52 },
  { key: "dash", active: "/app", render: () => <DashboardScreen frame={400} />, x: 0, y: -10, z: 0, rotY: 0, scale: 0.64 },
  { key: "conf", active: "/app/conferencia", render: () => <ConferencePage frame={400} />, x: 600, y: 40, z: -200, rotY: -22, scale: 0.52 },
]

/** Cena 7 — Encerramento: as telas do sistema em composição 3D e o logotipo. */
export function Outro({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const gather = progress(frame, 0, 40)
  const recede = progress(frame, 78, 34, easeInOut)
  const logo = progress(frame, 100, 30)
  const tagline = progress(frame, 122, 26)
  const fadeOut = progress(frame, duration - 22, 22, easeInOut)
  const orbit = interpolate(frame, [0, duration], [-4, 4])

  return (
    <AbsoluteFill>
      <Backdrop frame={frame + 1700} intensity={1 + logo * 0.3} />
      <AbsoluteFill style={{ perspective: 2400, opacity: 1 - recede }}>
        {SHOTS.map((s, i) => {
          const p = progress(frame, i * 6, 36)
          const z = s.z - recede * 900
          return (
            <div
              key={s.key}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%, -50%) translate3d(${s.x * (0.6 + 0.4 * gather)}px, ${s.y + (1 - p) * 160}px, ${z}px) rotateY(${s.rotY + orbit}deg) rotateX(${4 - recede * 8}deg) scale(${s.scale})`,
                opacity: p,
                filter: recede > 0 ? `blur(${recede * 14}px)` : undefined,
                zIndex: i === 1 ? 2 : 1,
              }}
            >
              <Window glow={1.4}>
                <AppShell active={s.active}>{s.render()}</AppShell>
              </Window>
            </div>
          )
        })}
      </AbsoluteFill>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - fadeOut }}>
        <div style={{ display: "flex", alignItems: "center", gap: 30, opacity: logo, transform: `scale(${0.92 + 0.08 * logo})`, filter: logo < 1 ? `blur(${(1 - logo) * 12}px)` : undefined }}>
          <div
            style={{
              width: 118,
              height: 118,
              borderRadius: 22,
              backgroundImage: "linear-gradient(135deg, #800020 0%, #4a0012 100%)",
              border: "2px solid rgba(212,175,55,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d4af37",
              fontWeight: 900,
              fontSize: 64,
              boxShadow: "0 30px 90px -10px rgba(128,0,32,0.8)",
            }}
          >
            O
          </div>
          <div>
            <div
              style={{
                fontSize: 92,
                fontWeight: 800,
                letterSpacing: "0.18em",
                backgroundImage: "linear-gradient(180deg, #f1d98a 0%, #d4af37 55%, #b48a4a 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              OSSALA
            </div>
            <div style={{ fontSize: 20, letterSpacing: "0.42em", textTransform: "uppercase", color: "#b3a79c" }}>Controle de Entregas</div>
          </div>
        </div>
        <div
          style={{
            marginTop: 54,
            fontSize: 40,
            color: "#f3eee6",
            opacity: tagline,
            transform: `translateY(${(1 - tagline) * 18}px)`,
          }}
        >
          Gestão inteligente. <span style={{ color: "#e8c98e", fontWeight: 700 }}>Entregas sob controle.</span>
        </div>
        <div
          style={{
            marginTop: 26,
            height: 1,
            width: 420 * tagline,
            background: "linear-gradient(90deg, transparent, #d4af37, transparent)",
          }}
        />
        <div style={{ marginTop: 22, fontSize: 17, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b48a4a", opacity: tagline }}>
          Entregas · Mapa · Conferência por foto · Pagamentos · Relatórios
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
    </AbsoluteFill>
  )
}
