// Renderiza o vídeo final (MP4 1920x1080, 30 FPS, H.264).
// Uso: npm run render            -> out/ossala-demo.mp4
//      npm run render -- --frames=0-299   (opções extras são repassadas ao Remotion)
import { spawnSync } from "node:child_process"

const extra = process.argv.slice(2)
const result = spawnSync(
  "npx",
  ["remotion", "render", "src/index.ts", "OssalaDemo", "out/ossala-demo.mp4", "--log=info", ...extra],
  {
    stdio: "inherit",
    // Idioma pt-BR no navegador: datas e números no padrão brasileiro, como no app.
    env: { ...process.env, LANG: "pt_BR.UTF-8", LANGUAGE: "pt-BR" },
  },
)
process.exit(result.status ?? 1)
