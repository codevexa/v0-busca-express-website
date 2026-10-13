import fs from "node:fs"
import path from "node:path"
import { Config } from "@remotion/cli/config"
import { enableTailwind } from "@remotion/tailwind-v4"

const VIDEO_DIR = process.cwd()
const APP_ROOT = path.resolve(VIDEO_DIR, "..")

Config.overrideWebpackConfig((current) => {
  const config = enableTailwind(current)
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(config.resolve?.alias ?? {}),
        // Mesmo alias do aplicativo: os componentes reais são importados sem cópia.
        "@": APP_ROOT,
        // Uma única instância do React para o vídeo e para os componentes do app.
        react: path.join(VIDEO_DIR, "node_modules/react"),
        "react-dom": path.join(VIDEO_DIR, "node_modules/react-dom"),
        // Componentes do app usam next/link; no vídeo ele vira uma âncora simples.
        "next/link": path.join(VIDEO_DIR, "src/shims/next-link.tsx"),
      },
    },
  }
})

// Saída: H.264, 1920x1080, 30 FPS (definidos na composição), alta qualidade.
Config.setVideoImageFormat("jpeg")
Config.setJpegQuality(95)
Config.setCodec("h264")
Config.setCrf(16)
Config.setPixelFormat("yuv420p")
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY) || null)

// Usa um Chromium já instalado, quando houver (evita o download do navegador).
const browser =
  process.env.REMOTION_BROWSER_EXECUTABLE ??
  ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell"].find((p) => fs.existsSync(p))
if (browser) Config.setBrowserExecutable(browser)
