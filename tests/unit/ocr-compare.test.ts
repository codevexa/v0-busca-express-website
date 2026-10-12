import { describe, expect, test } from "vitest"
import { compareDelivery, countDivergences, extractComandaCandidates, normalizeForCompare } from "@/lib/ocr/compare"
import type { OcrFields } from "@/lib/ocr/types"

const f = (value: string | null, confidence = 0.95) => ({ value, confidence })

const registered = {
  comanda_number: "A-123",
  address: "Rua João Pessoa",
  address_number: "45",
  complement: null,
  neighborhood: "Chácara das Pedras",
  city: "Porto Alegre",
  state: "RS",
}

describe("comparação da conferência", () => {
  test("normaliza abreviações e acentos", () => {
    expect(normalizeForCompare("R. João Pessoa")).toBe(normalizeForCompare("rua joao pessoa"))
    expect(normalizeForCompare("Av. Brasil")).toBe("avenida brasil")
    expect(normalizeForCompare("Nº 123", "comanda_number")).toBe("123")
  })

  test("campos correspondentes, divergentes, não reconhecidos e de baixa confiança", () => {
    const ocr: Partial<OcrFields> = {
      comanda_number: f("A123"),
      address: f("R. Joao Pessoa"),
      address_number: f("54"),
      complement: f(null, 0),
      neighborhood: f("Chacara das Pedras", 0.4),
      city: f("Porto Alegre"),
      state: f("RS"),
    }
    const rows = compareDelivery(registered, ocr)
    const by = Object.fromEntries(rows.map((r) => [r.field, r.status]))
    expect(by.comanda_number).toBe("match")
    expect(by.address).toBe("match")
    expect(by.address_number).toBe("divergent")
    expect(by.complement).toBe("not_recognized")
    expect(by.neighborhood).toBe("low_confidence")
    expect(by.city).toBe("match")
    expect(countDivergences(rows)).toBe(2)
  })

  test("valor identificado sem cadastro correspondente", () => {
    const rows = compareDelivery({ ...registered, complement: null }, { complement: f("Apto 3") })
    expect(rows.find((r) => r.field === "complement")?.status).toBe("missing_registered")
  })

  test("sem entrega localizada nada é dado como correspondente", () => {
    const rows = compareDelivery(null, { comanda_number: f("999"), address: f("Rua X") })
    expect(rows.every((r) => r.status !== "match")).toBe(true)
  })

  test("candidatos de número da comanda", () => {
    expect(extractComandaCandidates("Comanda: A-123")).toEqual(["A-123", "123"])
    expect(extractComandaCandidates(null)).toEqual([])
  })
})
