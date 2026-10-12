import { describe, expect, test } from "vitest"
import { fortnightRange, isValidISODate, monthRange, presetRange, previousFortnight, todayISO, weekRange } from "@/lib/dates"

describe("períodos", () => {
  test("quinzenas: 1 a 15 e 16 ao último dia", () => {
    expect(fortnightRange("2026-10-12")).toMatchObject({ from: "2026-10-01", to: "2026-10-15" })
    expect(fortnightRange("2026-10-16")).toMatchObject({ from: "2026-10-16", to: "2026-10-31" })
    expect(fortnightRange("2026-02-20")).toMatchObject({ from: "2026-02-16", to: "2026-02-28" })
    expect(fortnightRange("2028-02-29")).toMatchObject({ from: "2028-02-16", to: "2028-02-29" })
  })

  test("quinzena com dia de corte configurável", () => {
    expect(fortnightRange("2026-10-10", 10)).toMatchObject({ from: "2026-10-01", to: "2026-10-10" })
    expect(fortnightRange("2026-10-11", 10)).toMatchObject({ from: "2026-10-11", to: "2026-10-31" })
  })

  test("quinzena anterior atravessa o mês", () => {
    expect(previousFortnight("2026-10-05")).toMatchObject({ from: "2026-09-16", to: "2026-09-30" })
    expect(previousFortnight("2026-10-20")).toMatchObject({ from: "2026-10-01", to: "2026-10-15" })
  })

  test("semana de segunda a domingo e mês", () => {
    expect(weekRange("2026-10-12")).toMatchObject({ from: "2026-10-12", to: "2026-10-18" })
    expect(weekRange("2026-10-18")).toMatchObject({ from: "2026-10-12", to: "2026-10-18" })
    expect(monthRange("2026-12-05")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" })
  })

  test("atalhos", () => {
    expect(presetRange("ontem", "2026-10-01")).toMatchObject({ from: "2026-09-30", to: "2026-09-30" })
    expect(presetRange("mes_anterior", "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" })
    expect(presetRange("semana_anterior", "2026-10-12")).toMatchObject({ from: "2026-10-05", to: "2026-10-11" })
  })

  test("data de hoje no fuso de São Paulo", () => {
    // 02:00 UTC de 13/10 ainda é 12/10 em São Paulo (UTC-3)
    expect(todayISO(new Date("2026-10-13T02:00:00Z"))).toBe("2026-10-12")
  })

  test("valida datas", () => {
    expect(isValidISODate("2026-02-30")).toBe(false)
    expect(isValidISODate("2026-02-28")).toBe(true)
  })
})
