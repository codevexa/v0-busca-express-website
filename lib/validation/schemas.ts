import { z } from "zod"
import { isValidISODate } from "@/lib/dates"
import { passwordSchema } from "@/lib/validation/auth"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

const uuidOrNull = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .or(z.literal(""))
  .transform((v) => (v ? v : null))

export const isoDate = z.string().refine(isValidISODate, "Data inválida.")
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Horário inválido.")
  .transform((v) => v.slice(0, 5))

const money = z.coerce
  .number({ invalid_type_error: "Valor inválido." })
  .refine((v) => Number.isFinite(v), "Valor inválido.")
  .refine((v) => Math.abs(v) <= 99_999_999, "Valor muito alto.")
  .transform((v) => Math.round(v * 100) / 100)

export const deliverySchema = z
  .object({
    comanda_number: z.string().trim().min(1, "Informe o número da comanda.").max(40),
    delivery_date: isoDate,
    delivery_time: hhmm,
    address: z.string().trim().min(3, "Informe o endereço.").max(200),
    address_number: optionalText(20),
    complement: optionalText(120),
    neighborhood: optionalText(120),
    city: optionalText(120),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "UF deve ter 2 letras."),
    postal_code: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^\d{5}-?\d{3}$/.test(v), "CEP inválido."),
    latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
    longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
    geocode_source: z.enum(["nominatim", "manual", "mapa"]).optional().nullable(),
    motoboy_id: uuidOrNull,
    area_id: uuidOrNull,
    notes: optionalText(1000),
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    message: "Latitude e longitude devem ser informadas juntas.",
    path: ["latitude"],
  })

export type DeliveryInput = z.input<typeof deliverySchema>

export const extraSchema = z
  .object({
    delivery_id: z.string().uuid(),
    kind: z.enum(["manual", "ajuste", "desconto"]),
    description: z.string().trim().min(2, "Descreva o extra.").max(200),
    charge_amount: money,
    repass_amount: money,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "desconto") {
      if (v.charge_amount > 0 || v.repass_amount > 0) {
        ctx.addIssue({ code: "custom", message: "Descontos devem ter valores negativos ou zero.", path: ["repass_amount"] })
      }
    } else if (v.kind === "manual" && (v.charge_amount < 0 || v.repass_amount < 0)) {
      ctx.addIssue({ code: "custom", message: "Extras manuais não podem ser negativos.", path: ["repass_amount"] })
    }
    if (v.charge_amount === 0 && v.repass_amount === 0) {
      ctx.addIssue({ code: "custom", message: "Informe ao menos um valor.", path: ["repass_amount"] })
    }
  })

export const motoboySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome.").max(120),
  phone: optionalText(30),
  document: optionalText(30),
  vehicle: optionalText(60),
  plate: optionalText(10),
  pix_key: optionalText(120),
  notes: optionalText(500),
  active: z.boolean().default(true),
})

export const areaSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe o nome.").max(60),
  code: optionalText(20),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  charge_amount: money.refine((v) => v >= 0, "Valor não pode ser negativo."),
  repass_amount: money.refine((v) => v >= 0, "Valor não pode ser negativo."),
  is_special: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: optionalText(500),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
})

export const neighborhoodSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o bairro.").max(120),
  city: optionalText(120),
  area_id: uuidOrNull,
  active: z.boolean().default(true),
})

export const extraRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  description: optionalText(300),
  kind: z.enum(["automatico", "manual"]),
  charge_amount: money.refine((v) => v >= 0, "Valor não pode ser negativo."),
  repass_amount: money.refine((v) => v >= 0, "Valor não pode ser negativo."),
  active: z.boolean().default(true),
  conditions: z
    .object({
      area_ids: z.array(z.string().uuid()).default([]),
      neighborhood_ids: z.array(z.string().uuid()).default([]),
      weekdays: z.array(z.number().int().min(0).max(6)).default([]),
      start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
      end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
    })
    .refine((c) => !!c.start_time === !!c.end_time, { message: "Informe início e fim do horário.", path: ["end_time"] }),
})

export const createUserSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  matricula: z
    .string()
    .trim()
    .min(1, "Informe a matrícula.")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Use apenas letras, números, ponto, hífen ou sublinhado."),
  role: z.enum(["ADMIN", "GESTOR", "ADMINISTRATIVO", "MOTOBOY"]),
  password: passwordSchema,
  phone: optionalText(30),
  recovery_email: z
    .string()
    .trim()
    .email("E-mail inválido.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  must_change_password: z.boolean().default(true),
  motoboy_id: uuidOrNull,
})

export const updateUserSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120),
  role: z.enum(["ADMIN", "GESTOR", "ADMINISTRATIVO", "MOTOBOY"]),
  phone: optionalText(30),
  ativo: z.boolean(),
})

export const settingsSchema = z
  .object({
    store_name: optionalText(120),
    store_address: optionalText(200),
    store_lat: z.coerce.number().min(-90).max(90).optional().nullable(),
    store_lng: z.coerce.number().min(-180).max(180).optional().nullable(),
    default_city: optionalText(120),
    default_state: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "UF deve ter 2 letras."),
    closing_split_day: z.coerce.number().int().min(1).max(27),
    photo_retention_days: z.coerce.number().int().min(7).max(3650),
    pending_alert_minutes: z.coerce.number().int().min(5).max(1440),
    report_title: z.string().trim().min(3).max(120),
  })
  .refine((v) => (v.store_lat == null) === (v.store_lng == null), {
    message: "Informe latitude e longitude da loja.",
    path: ["store_lat"],
  })

export const manualAddressSchema = z.object({
  id: z.string().uuid().optional(),
  label: optionalText(80),
  address: z.string().trim().min(3).max(200),
  address_number: optionalText(20),
  neighborhood: optionalText(120),
  city: optionalText(120),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .nullable()
    .transform((v) => (v ? v.slice(0, 2) : null)),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  delivery_id: uuidOrNull,
})

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos."
}
