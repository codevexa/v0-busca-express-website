import { interpolate } from "remotion"
import { formatDateBR } from "@/lib/dates"
import { DEMO_DATE, NEW_DELIVERY } from "../data/demo"

/**
 * "Fotografia" de uma comanda impressa (fictícia), desenhada em HTML:
 * papel térmico levemente inclinado sobre uma bancada. `scan` (0..1) anima a leitura do OCR.
 */
export function Receipt({ width = 260, scan = -1, boxes = 0 }: { width?: number; scan?: number; boxes?: number }) {
  const n = NEW_DELIVERY
  const h = width * 1.3
  const lines: Array<{ t: string; b?: boolean; big?: boolean; field?: boolean; smudge?: boolean }> = [
    { t: "OSSALA", b: true, big: true },
    { t: "------------------------------" },
    { t: `COMANDA Nº ${n.comanda}`, b: true, field: true },
    { t: `${formatDateBR(DEMO_DATE)}  ${n.time}` },
    { t: "ENTREGA", b: true },
    { t: `R. das Palmeiras, 12`, field: true, smudge: true },
    { t: "Ap 32", field: true },
    { t: n.neighborhood, field: true },
    { t: `${n.city} - ${n.state}`, field: true },
    { t: "------------------------------" },
    { t: "2 itens          R$ 48,90" },
    { t: "Taxa entrega     R$ 10,00" },
    { t: "TOTAL            R$ 58,90", b: true },
  ]
  let fieldIndex = 0
  return (
    <div
      style={{
        width,
        height: h,
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        background: "radial-gradient(120% 90% at 30% 20%, #3b2a22, #1a1210 70%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: width * 0.12,
          top: h * 0.05,
          width: width * 0.76,
          height: h * 0.9,
          background: "linear-gradient(180deg, #fbf8f1, #efe9dc)",
          transform: "rotate(-3deg)",
          boxShadow: "0 12px 24px rgba(0,0,0,0.55)",
          padding: `${width * 0.05}px ${width * 0.05}px`,
          fontFamily: "Geist Mono, monospace",
          color: "#2b2522",
          fontSize: width * 0.042,
          lineHeight: 1.55,
          letterSpacing: "-0.02em",
        }}
      >
        {lines.map((l, i) => {
          const isField = l.field
          const fi = isField ? fieldIndex++ : -1
          const boxOn = isField && boxes > fi
          return (
            <div
              key={i}
              style={{
                position: "relative",
                fontWeight: l.b ? 700 : 400,
                fontSize: l.big ? width * 0.07 : undefined,
                textAlign: l.big ? "center" : undefined,
                whiteSpace: "pre",
                outline: boxOn ? "1.5px solid rgba(212,175,55,0.95)" : undefined,
                background: boxOn ? "rgba(212,175,55,0.16)" : undefined,
                borderRadius: 2,
              }}
            >
              {l.t}
              {l.smudge && <span style={{ filter: "blur(1.2px)", opacity: 0.7 }}>0</span>}
            </div>
          )
        })}
      </div>
      {/* Reflexo/sombra da foto */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(130deg, rgba(255,255,255,0.08), transparent 40%, rgba(0,0,0,0.25))" }} />
      {scan >= 0 && scan <= 1 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: interpolate(scan, [0, 1], [0, h]),
            height: 2,
            background: "#d4af37",
            boxShadow: "0 0 18px 6px rgba(212,175,55,0.45)",
          }}
        />
      )}
    </div>
  )
}
