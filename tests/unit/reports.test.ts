import { describe, expect, test } from "vitest"
import type { DeliveryRow } from "@/lib/domain"
import { groupTotals, totalsOf } from "@/lib/reports/aggregate"
import { buildReportPdf } from "@/lib/reports/pdf"

function row(partial: Partial<DeliveryRow>): DeliveryRow {
  return {
    id: crypto.randomUUID(),
    company_id: "c",
    comanda_number: "1",
    delivery_date: "2026-10-12",
    delivery_time: "10:00:00",
    address: "Rua A",
    address_number: "1",
    complement: null,
    neighborhood: "Centro",
    neighborhood_id: null,
    city: "Porto Alegre",
    state: "RS",
    postal_code: null,
    latitude: null,
    longitude: null,
    geocode_source: null,
    motoboy_id: "m1",
    area_id: "a1",
    charge_amount: 10,
    repass_amount: 7.5,
    extras_charge_total: 0,
    extras_repass_total: 0,
    adjustments_total: 0,
    charge_total: 10,
    repass_gross: 7.5,
    repass_net: 7.5,
    status: "entregue",
    payment_status: "pendente",
    has_divergence: false,
    conference_status: null,
    notes: null,
    cancel_reason: null,
    delivered_at: null,
    created_at: "",
    updated_at: "",
    motoboy_name: "Ana",
    area_name: "Área 1",
    area_color: "#800020",
    ...partial,
  }
}

describe("agregação dos relatórios", () => {
  const rows = [
    row({ repass_net: 7.1, repass_gross: 7.1, repass_amount: 7.1 }),
    row({ repass_net: 0.2, repass_gross: 0.2, repass_amount: 0.2, payment_status: "pago" }),
    row({ status: "pendente", charge_total: 12 }),
    row({ status: "cancelada", charge_total: 99, repass_net: 99 }),
    row({ motoboy_name: "Bruno", motoboy_id: "m2", adjustments_total: -0.5, repass_net: 7, repass_gross: 7.5 }),
  ]

  test("totais sem erro de arredondamento e regras de inclusão", () => {
    const t = totalsOf(rows)
    expect(t.count).toBe(5)
    expect(t.delivered).toBe(3)
    expect(t.open).toBe(1)
    expect(t.canceled).toBe(1)
    expect(t.charge).toBe(10 + 10 + 12 + 10) // canceladas fora
    expect(t.net).toBe(14.3) // 7.1 + 0.2 + 7
    expect(t.paid).toBe(0.2)
    expect(t.pending).toBe(14.1)
    expect(t.adjustments).toBe(-0.5)
  })

  test("soma dos grupos é igual ao total geral", () => {
    const groups = groupTotals(rows, (d) => d.motoboy_name ?? "")
    const net = groups.reduce((s, g) => s + Math.round(g.totals.net * 100), 0) / 100
    expect(net).toBe(totalsOf(rows).net)
    expect(groups.map((g) => g.key)).toEqual(["Ana", "Bruno"])
  })
})

describe("PDF A4", () => {
  test("gera documento paginado com cabeçalho repetido", () => {
    const many = Array.from({ length: 180 }, (_, i) => ({ comanda: String(i + 1), endereco: `Rua ${i}`, valor: "R$ 7,50" }))
    const doc = buildReportPdf({
      companyName: "OSSALA",
      reportTitle: "OSSALA - BUSCAR EXPRESS",
      title: "Relatório geral de entregas",
      period: "01/10/2026 a 15/10/2026",
      filters: ["Motoboy: Ana"],
      generatedBy: "Teste",
      generatedAt: new Date("2026-10-12T12:00:00Z"),
      summary: [{ label: "Entregas", value: "180" }],
      sections: [
        {
          columns: [
            { key: "comanda", label: "Comanda" },
            { key: "endereco", label: "Endereço" },
            { key: "valor", label: "Valor", align: "right" },
          ],
          rows: many,
          totals: { comanda: "180", valor: "R$ 1.350,00" },
        },
      ],
    })
    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    const size = doc.internal.pageSize
    expect(Math.round(size.getWidth())).toBe(210)
    expect(Math.round(size.getHeight())).toBe(297)
    const pdf = doc.output()
    expect(pdf.startsWith("%PDF")).toBe(true)
  })
})
