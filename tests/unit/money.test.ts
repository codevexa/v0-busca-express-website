import { describe, expect, test } from "vitest"
import { computeDeliveryTotals, computeExtrasTotals, formatBRL, parseMoneyInput, sumCents, toCents } from "@/lib/money"

describe("valores monetários", () => {
  test("soma sem erro de ponto flutuante", () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(sumCents([0.1, 0.2])).toBe(30)
    expect(toCents("7,50")).toBe(750)
  })

  test("interpreta entradas brasileiras", () => {
    expect(parseMoneyInput("R$ 1.234,56")).toBe(1234.56)
    expect(parseMoneyInput("12,5")).toBe(12.5)
    expect(parseMoneyInput("-0,50")).toBe(-0.5)
    expect(parseMoneyInput("abc")).toBeNull()
  })

  test("formata em reais", () => {
    expect(formatBRL(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50")
  })

  test("totais da entrega seguem a visão delivery_financials", () => {
    const totals = computeDeliveryTotals({
      charge_amount: 10,
      repass_amount: 7.5,
      extras_charge_total: 4.5,
      extras_repass_total: 3,
      adjustments_total: -0.5,
    })
    expect(totals).toEqual({ chargeTotal: 14.5, repassGross: 10.5, repassNet: 10 })
  })

  test("extras: ajustes e descontos não entram no repasse bruto e cancelados são ignorados", () => {
    const t = computeExtrasTotals([
      { kind: "automatico", charge_amount: 3, repass_amount: 2 },
      { kind: "manual", charge_amount: 1.5, repass_amount: 1 },
      { kind: "desconto", charge_amount: 0, repass_amount: -0.5 },
      { kind: "ajuste", charge_amount: 0, repass_amount: 2 },
      { kind: "manual", charge_amount: 9, repass_amount: 9, canceled_at: "2026-01-01" },
    ])
    expect(t).toEqual({ extras_charge_total: 4.5, extras_repass_total: 3, adjustments_total: 1.5 })
  })
})
