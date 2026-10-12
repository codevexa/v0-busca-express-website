export const dynamic = "force-static"

/** Manifesto do PWA (instalável) — escopo restrito ao aplicativo /app. */
export function GET() {
  const manifest = {
    name: "OSSALA - Controle de Entregas",
    short_name: "OSSALA",
    description: "Gestão operacional e financeira das entregas da OSSALA.",
    id: "/app",
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    orientation: "portrait",
    background_color: "#100b0d",
    theme_color: "#800020",
    lang: "pt-BR",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Hoje", url: "/app" },
      { name: "Minhas entregas", url: "/app/minhas-entregas" },
      { name: "Fotos de comandas", url: "/app/fotos" },
    ],
  }
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  })
}
