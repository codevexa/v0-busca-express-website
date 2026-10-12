import { ImageResponse } from "next/og"

const SIZES = new Set([180, 192, 512])

/** Ícones do PWA gerados com a identidade OSSALA (bordô + dourado). */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192
  const maskable = new URL(request.url).searchParams.get("maskable") === "1"
  const pad = maskable ? size * 0.18 : size * 0.08
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#800020" : "#100b0d",
        }}
      >
        <div
          style={{
            width: size - pad * 2,
            height: size - pad * 2,
            borderRadius: maskable ? 0 : size * 0.18,
            background: "linear-gradient(135deg, #800020 0%, #4a0012 100%)",
            border: maskable ? "none" : `${Math.max(2, size * 0.02)}px solid #d4af37`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#d4af37",
          }}
        >
          <div style={{ fontSize: size * 0.42, fontWeight: 900, lineHeight: 1 }}>O</div>
          <div style={{ fontSize: size * 0.1, fontWeight: 800, letterSpacing: size * 0.012, marginTop: size * 0.02 }}>OSSALA</div>
        </div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400, immutable" } },
  )
}
