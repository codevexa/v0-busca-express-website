import { Minus, Plus } from "lucide-react"
import type React from "react"

/**
 * Base cartográfica ILUSTRATIVA no estilo das camadas padrão do OpenStreetMap
 * (o app usa os tiles do OSM; no vídeo a base é desenhada em SVG para não depender
 * de rede nem reproduzir tiles). Gerada de forma determinística.
 */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export function MapCanvas({ width, height, zoom = 1, children }: { width: number; height: number; zoom?: number; children?: React.ReactNode }) {
  const r = rng(7)
  const blocks: React.ReactNode[] = []
  const step = 58
  for (let x = -step; x < width + step; x += step) {
    for (let y = -step; y < height + step; y += step) {
      const jx = (r() - 0.5) * 10
      const jy = (r() - 0.5) * 10
      const fill = r() > 0.86 ? "#d8e8c8" : r() > 0.7 ? "#e0dfdf" : "#efe9e1"
      blocks.push(<rect key={`${x}-${y}`} x={x + 7 + jx} y={y + 7 + jy} width={step - 14} height={step - 14} rx={3} fill={fill} />)
    }
  }
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#f2efe9" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, transform: `scale(${zoom})`, transformOrigin: "50% 50%" }}>
        <rect width={width} height={height} fill="#f2efe9" />
        <g transform="rotate(-8 400 300)">{blocks}</g>
        {/* Parques e água */}
        <path d={`M ${width * 0.05} ${height * 0.15} q 80 -30 140 20 t 60 90 q -70 40 -150 10 z`} fill="#c8e6b0" />
        <path d={`M ${width * 0.68} ${height * 0.72} q 90 -20 130 30 q -10 70 -110 60 q -40 -40 -20 -90 z`} fill="#c8e6b0" />
        <path
          d={`M -20 ${height * 0.86} C ${width * 0.25} ${height * 0.78}, ${width * 0.45} ${height * 0.98}, ${width * 0.7} ${height * 0.9} S ${width * 1.05} ${height * 0.82}, ${width + 30} ${height * 0.86}`}
          stroke="#aad3df"
          strokeWidth={34}
          fill="none"
        />
        {/* Ruas */}
        <g transform="rotate(-8 400 300)" stroke="#ffffff" strokeLinecap="round">
          {Array.from({ length: Math.ceil(width / step) + 4 }).map((_, i) => (
            <line key={`v${i}`} x1={i * step - step} y1={-80} x2={i * step - step} y2={height + 80} strokeWidth={6} />
          ))}
          {Array.from({ length: Math.ceil(height / step) + 4 }).map((_, i) => (
            <line key={`h${i}`} x1={-80} y1={i * step - step} x2={width + 80} y2={i * step - step} strokeWidth={6} />
          ))}
        </g>
        {/* Avenidas principais (amarelo/laranja como no OSM) */}
        <path d={`M -20 ${height * 0.3} L ${width + 20} ${height * 0.62}`} stroke="#c9a94a" strokeWidth={13} strokeLinecap="round" />
        <path d={`M -20 ${height * 0.3} L ${width + 20} ${height * 0.62}`} stroke="#f7e09a" strokeWidth={9} strokeLinecap="round" />
        <path d={`M ${width * 0.38} -20 C ${width * 0.45} ${height * 0.4}, ${width * 0.52} ${height * 0.6}, ${width * 0.6} ${height + 20}`} stroke="#d39b5b" strokeWidth={13} fill="none" />
        <path d={`M ${width * 0.38} -20 C ${width * 0.45} ${height * 0.4}, ${width * 0.52} ${height * 0.6}, ${width * 0.6} ${height + 20}`} stroke="#fcd6a4" strokeWidth={9} fill="none" />
        <path d={`M ${width * 0.82} -20 L ${width * 0.7} ${height + 20}`} stroke="#f7e09a" strokeWidth={8} />
      </svg>
      {/* Controle de zoom do Leaflet */}
      <div
        className="absolute top-2.5 left-2.5 z-[800] overflow-hidden rounded bg-white text-black"
        style={{ border: "2px solid rgba(0,0,0,0.2)", backgroundClip: "padding-box" }}
      >
        <div className="flex size-[30px] items-center justify-center border-b border-[#ccc]">
          <Plus className="size-4" strokeWidth={3} />
        </div>
        <div className="flex size-[30px] items-center justify-center">
          <Minus className="size-4" strokeWidth={3} />
        </div>
      </div>
      {children}
    </div>
  )
}

/** Marcador de entrega: mesmo HTML do divIcon de components/map/leaflet-map.tsx (anchor 11x24). */
export function DeliveryPin({ x, y, color, areaColor, drop = 1, dim = 0, ring = 0 }: {
  x: number
  y: number
  color: string
  areaColor: string
  drop?: number
  dim?: number
  ring?: number
}) {
  if (drop <= 0) return null
  return (
    <div
      className="ossala-area-marker"
      style={{
        position: "absolute",
        left: x - 11,
        top: y - 24 - (1 - drop) * 60,
        width: 26,
        height: 26,
        opacity: Math.min(1, drop * 2) * (1 - dim * 0.82),
        zIndex: Math.round(y),
      }}
    >
      {ring > 0 && (
        <div
          style={{
            position: "absolute",
            left: 11 - 22,
            top: 24 - 22,
            width: 44,
            height: 44,
            borderRadius: 99,
            border: `2px solid ${areaColor}`,
            opacity: 1 - ring,
            transform: `scale(${0.4 + ring})`,
          }}
        />
      )}
      <div className="pin" style={{ background: color, outline: `2px solid ${areaColor}`, outlineOffset: 1 }} />
    </div>
  )
}

/** Marcador da loja: mesmo HTML do storeIcon (anchor central). */
export function StorePin({ x, y, pulse }: { x: number; y: number; pulse: number }) {
  return (
    <div className="ossala-store-marker" style={{ position: "absolute", left: x - 19, top: y - 19, width: 38, height: 38, zIndex: 2000 }}>
      <div
        style={{
          position: "absolute",
          inset: -14,
          borderRadius: 99,
          border: "2px solid #d4af37",
          opacity: 0.8 * (1 - pulse),
          transform: `scale(${0.6 + pulse * 0.9})`,
        }}
      />
      <div className="pin">LOJA</div>
    </div>
  )
}

/** Popup no estilo .leaflet-popup do app (cores definidas em globals.css). */
export function MapPopup({ x, y, p, children }: { x: number; y: number; p: number; children: React.ReactNode }) {
  if (p <= 0) return null
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 5000,
        opacity: p,
        transform: `translate(-50%, calc(-100% - ${8 + (1 - p) * 10}px))`,
      }}
    >
      <div style={{ background: "#171214", color: "#f3eee6", border: "1px solid #2e2427", borderRadius: 12, padding: "10px 12px", boxShadow: "0 3px 14px rgba(0,0,0,0.4)" }}>
        {children}
      </div>
      <div
        style={{
          width: 14,
          height: 14,
          background: "#171214",
          border: "1px solid #2e2427",
          borderTop: "none",
          borderLeft: "none",
          transform: "rotate(45deg)",
          margin: "-8px auto 0",
        }}
      />
    </div>
  )
}
