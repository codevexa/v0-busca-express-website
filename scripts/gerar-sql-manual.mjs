/**
 * Gera supabase/manual/aplicar_no_sql_editor.sql a partir das migrations que
 * precisam ser aplicadas pelo SQL Editor do Supabase.
 *
 * O arquivo gerado não tem comentários: ao copiar o texto de uma visualização
 * formatada, "--" pode virar travessão e quebrar o SQL.
 *
 * Uso: node scripts/gerar-sql-manual.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export const MANUAL_MIGRATIONS = ["20261012000700_closings.sql", "20261012000850_replace_legacy_rules.sql"]

export function stripComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .map((line) => (line.includes("'") ? line : line.replace(/\s+--\s.*$/, "")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function buildManualSql(root = process.cwd()) {
  const parts = MANUAL_MIGRATIONS.map((file) =>
    stripComments(readFileSync(join(root, "supabase", "migrations", file), "utf8")),
  )
  return ["begin;", ...parts, "commit;", ""].join("\n\n")
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(join(process.cwd(), "supabase", "manual", "aplicar_no_sql_editor.sql"), buildManualSql())
  console.log("supabase/manual/aplicar_no_sql_editor.sql atualizado")
}
