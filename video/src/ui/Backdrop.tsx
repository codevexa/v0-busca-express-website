import { AbsoluteFill } from "remotion"

/** Fundo premium: preto profundo, brilhos bordô/dourado em deriva lenta, grade sutil e vinheta. */
export function Backdrop({ frame, intensity = 1 }: { frame: number; intensity?: number }) {
  const t = frame / 30
  const x1 = 22 + Math.sin(t * 0.25) * 6
  const y1 = 18 + Math.cos(t * 0.2) * 5
  const x2 = 80 + Math.cos(t * 0.22) * 6
  const y2 = 84 + Math.sin(t * 0.18) * 5
  return (
    <AbsoluteFill style={{ background: "#070506", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${x1}% ${y1}%, rgba(128,0,32,${0.42 * intensity}), transparent 70%),
            radial-gradient(800px 600px at ${x2}% ${y2}%, rgba(212,175,55,${0.12 * intensity}), transparent 70%),
            radial-gradient(1200px 800px at 50% 120%, rgba(74,0,18,${0.5 * intensity}), transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(232,201,142,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(232,201,142,0.045) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          backgroundPosition: `${(t * 4) % 64}px ${(t * 2) % 64}px`,
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 85%)",
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 55%, rgba(0,0,0,0.7) 100%)" }} />
    </AbsoluteFill>
  )
}
