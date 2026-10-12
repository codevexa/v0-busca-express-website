/**
 * Datas no fuso da operação (America/Sao_Paulo). As datas de negócio são
 * strings "YYYY-MM-DD" para evitar deslocamentos de fuso.
 */

export const TIMEZONE = "America/Sao_Paulo"

export type ISODate = string

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Data de hoje no fuso de São Paulo. */
export function todayISO(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** Hora atual "HH:MM" no fuso de São Paulo. */
export function nowTimeHHMM(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now)
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = parseISODate(s)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

export interface Range {
  from: ISODate
  to: ISODate
  label: string
}

/** Semana de segunda a domingo contendo a data. */
export function weekRange(s: ISODate): Range {
  const d = parseISODate(s)
  const dow = (d.getDay() + 6) % 7 // 0 = segunda
  const from = addDays(s, -dow)
  return { from, to: addDays(from, 6), label: "Semana" }
}

export function monthRange(s: ISODate): Range {
  const d = parseISODate(s)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`,
    label: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d),
  }
}

/**
 * Quinzena contendo a data: dia 1 até o dia de corte (padrão 15) e do dia
 * seguinte até o último dia do mês.
 */
export function fortnightRange(s: ISODate, splitDay = 15): Range {
  const d = parseISODate(s)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const last = lastDayOfMonth(y, m)
  const split = Math.min(Math.max(splitDay, 1), last - 1)
  if (d.getDate() <= split) {
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(split)}`, label: `1ª quinzena` }
  }
  return { from: `${y}-${pad(m)}-${pad(split + 1)}`, to: `${y}-${pad(m)}-${pad(last)}`, label: `2ª quinzena` }
}

export function previousFortnight(s: ISODate, splitDay = 15): Range {
  const current = fortnightRange(s, splitDay)
  return fortnightRange(addDays(current.from, -1), splitDay)
}

export function presetRange(preset: string, today: ISODate = todayISO(), splitDay = 15): Range {
  switch (preset) {
    case "ontem": {
      const y = addDays(today, -1)
      return { from: y, to: y, label: "Ontem" }
    }
    case "semana":
      return { ...weekRange(today), label: "Semana atual" }
    case "semana_anterior": {
      const w = weekRange(addDays(weekRange(today).from, -1))
      return { ...w, label: "Semana anterior" }
    }
    case "mes":
      return { ...monthRange(today), label: "Mês atual" }
    case "mes_anterior": {
      const m = monthRange(addDays(monthRange(today).from, -1))
      return { ...m, label: "Mês anterior" }
    }
    case "quinzena":
      return { ...fortnightRange(today, splitDay), label: "Quinzena atual" }
    case "quinzena_anterior":
      return { ...previousFortnight(today, splitDay), label: "Quinzena anterior" }
    case "hoje":
    default:
      return { from: today, to: today, label: "Hoje" }
  }
}

export function formatDateBR(s: ISODate | null | undefined): string {
  if (!s) return "—"
  const [y, m, d] = s.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}

export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "—"
  return t.slice(0, 5)
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = parseISODate(s)
  return toISODate(d) === s
}
