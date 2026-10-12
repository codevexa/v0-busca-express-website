import { z } from "zod"

export const loginSchema = z.object({
  matricula: z.string().trim().min(1, "Informe a matrícula.").max(40),
  password: z.string().min(1, "Informe a senha.").max(200),
})

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.")
  .regex(/[A-Za-z]/, "A senha deve conter letras.")
  .regex(/\d/, "A senha deve conter números.")

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual."),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] })
