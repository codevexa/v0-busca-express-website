// Gera um quadro isolado para conferência: npm run still -- 450  -> out/frame-450.png
import { spawnSync } from "node:child_process"

const [frame = "0", ...extra] = process.argv.slice(2)
const result = spawnSync(
  "npx",
  ["remotion", "still", "src/index.ts", "OssalaDemo", `out/frame-${frame}.png`, `--frame=${frame}`, "--log=error", ...extra],
  { stdio: "inherit", env: { ...process.env, LANG: "pt_BR.UTF-8", LANGUAGE: "pt-BR" } },
)
process.exit(result.status ?? 1)
