import { beforeAll, describe, expect, test } from "vitest"
import { asAdmin, asUser, createDb, createUser, type Db } from "./harness"

const C1 = "11111111-1111-1111-1111-111111111111"
const C2 = "22222222-2222-2222-2222-222222222222"
const ADMIN = "a0000000-0000-0000-0000-000000000001"
const GESTOR = "a0000000-0000-0000-0000-000000000002"
const ADMINISTRATIVO = "a0000000-0000-0000-0000-000000000003"
const MOTO1 = "a0000000-0000-0000-0000-000000000004"
const MOTO2 = "a0000000-0000-0000-0000-000000000005"
const OTHER_ADMIN = "b0000000-0000-0000-0000-000000000001"

let db: Db
let area1: string
let area2: string
let moto1Id: string
let moto2Id: string
const today = new Date().toISOString().slice(0, 10)

async function expectError(promise: Promise<unknown>, match: RegExp) {
  await expect(promise).rejects.toThrow(match)
}

beforeAll(async () => {
  db = await createDb()
  await asAdmin(db, `insert into public.companies (id, name, slug) values ($1, 'OSSALA Teste', 'ossala-teste'), ($2, 'Outra Empresa', 'outra')`, [C1, C2])
  await asAdmin(db, `insert into public.app_settings (company_id) values ($1), ($2)`, [C1, C2])
  await asAdmin(db, `insert into public.delivery_areas (company_id, name, color, sort_order) select $1, n, '#800020', o from (values ('Área 1',1),('Área 2',2),('Área 3',3)) v(n,o)`, [C1])

  await createUser(db, { id: ADMIN, companyId: C1, matricula: "ADM1", nome: "Admin", role: "ADMIN" })
  await createUser(db, { id: GESTOR, companyId: C1, matricula: "GES1", nome: "Gestor", role: "GESTOR" })
  await createUser(db, { id: ADMINISTRATIVO, companyId: C1, matricula: "ADMV1", nome: "Administrativo", role: "ADMINISTRATIVO" })
  await createUser(db, { id: MOTO1, companyId: C1, matricula: "401", nome: "Motoboy Um", role: "MOTOBOY" })
  await createUser(db, { id: MOTO2, companyId: C1, matricula: "402", nome: "Motoboy Dois", role: "MOTOBOY" })
  await createUser(db, { id: OTHER_ADMIN, companyId: C2, matricula: "X1", nome: "Admin Outra", role: "ADMIN" })

  const areas = await asAdmin<{ id: string; name: string }>(db, `select id, name from public.delivery_areas where company_id = $1 order by sort_order`, [C1])
  area1 = areas.find((a) => a.name === "Área 1")!.id
  area2 = areas.find((a) => a.name === "Área 2")!.id
  const motos = await asAdmin<{ id: string; profile_id: string }>(db, `select id, profile_id from public.motoboys where company_id = $1`, [C1])
  moto1Id = motos.find((m) => m.profile_id === MOTO1)!.id
  moto2Id = motos.find((m) => m.profile_id === MOTO2)!.id
}, 120000)

describe("autenticação e permissões", () => {
  test("login por matrícula resolve o e-mail interno (sem diferenciar maiúsculas)", async () => {
    const rows = await asAdmin<{ email: string }>(db, `select public.resolve_login_email('adm1') as email`)
    expect(rows[0].email).toBe("ADM1@ossala.internal")
  })

  test("anônimo não consegue consultar o e-mail de uma matrícula", async () => {
    await expectError(asUser(db, null, `select public.resolve_login_email('adm1')`), /permission denied/)
  })

  test("usuário inativo não resolve login", async () => {
    await asAdmin(db, `update public.profiles set ativo = false where id = $1`, [MOTO2])
    const rows = await asAdmin<{ email: string | null }>(db, `select public.resolve_login_email('402') as email`)
    expect(rows[0].email).toBeNull()
    await asAdmin(db, `update public.profiles set ativo = true where id = $1`, [MOTO2])
  })

  test("my_context traz papel e permissões efetivas", async () => {
    const [ctx] = await asUser<{ c: { role: string; permissions: string[] } }>(db, MOTO1, `select public.my_context() c`)
    expect(ctx.c.role).toBe("MOTOBOY")
    expect(ctx.c.permissions).toContain("entregas.confirmar")
    expect(ctx.c.permissions).not.toContain("entregas.criar")
    const [adm] = await asUser<{ c: { permissions: string[] } }>(db, ADMIN, `select public.my_context() c`)
    expect(adm.c.permissions).toContain("usuarios.gerenciar")
  })

  test("admin configura permissão individual (revogação) e ela vale no backend", async () => {
    await asUser(db, ADMIN, `insert into public.user_permissions (user_id, permission_key, allowed, granted_by) values ($1, 'entregas.criar', false, $2)`, [ADMINISTRATIVO, ADMIN])
    const [r] = await asUser<{ ok: boolean }>(db, ADMINISTRATIVO, `select app.has_perm('entregas.criar') ok`)
    expect(r.ok).toBe(false)
    await expectError(
      asUser(db, ADMINISTRATIVO, `insert into public.deliveries (comanda_number, delivery_date, delivery_time, address) values ('X', current_date, '10:00', 'Rua A')`),
      /row-level security/,
    )
    await asUser(db, ADMIN, `delete from public.user_permissions where user_id = $1`, [ADMINISTRATIVO])
  })

  test("restrição configurável por papel na empresa", async () => {
    await asUser(db, ADMIN, `insert into public.company_role_overrides (company_id, role, permission_key, allowed) values ($1, 'ADMINISTRATIVO', 'relatorios.exportar', false)`, [C1])
    const [r] = await asUser<{ ok: boolean }>(db, ADMINISTRATIVO, `select app.has_perm('relatorios.exportar') ok`)
    expect(r.ok).toBe(false)
    await asUser(db, ADMIN, `delete from public.company_role_overrides where company_id = $1`, [C1])
  })

  test("usuário não altera a própria função", async () => {
    await expectError(asUser(db, GESTOR, `update public.profiles set role = 'ADMIN' where id = $1`, [GESTOR]), /própria função/)
  })

  test("gestor sem usuarios.gerenciar não edita outros perfis", async () => {
    const rows = await asUser(db, GESTOR, `update public.profiles set nome = 'Hack' where id = $1 returning id`, [MOTO1])
    expect(rows).toHaveLength(0)
  })

  test("usuário edita o próprio perfil (nome/telefone)", async () => {
    const rows = await asUser(db, MOTO1, `update public.profiles set phone = '51999990000' where id = $1 returning id`, [MOTO1])
    expect(rows).toHaveLength(1)
  })

  test("admin desativa e reativa usuário", async () => {
    await asUser(db, ADMIN, `update public.profiles set ativo = false where id = $1`, [MOTO2])
    const [p] = await asAdmin<{ deactivated_at: string | null; tipo: string }>(db, `select deactivated_at, tipo from public.profiles where id = $1`, [MOTO2])
    expect(p.deactivated_at).not.toBeNull()
    expect(p.tipo).toBe("motoboy")
    await asUser(db, ADMIN, `update public.profiles set ativo = true where id = $1`, [MOTO2])
  })
})

describe("áreas, entregas e cálculos", () => {
  test("áreas recebem valores configuráveis e histórico", async () => {
    await asUser(db, GESTOR, `update public.delivery_areas set charge_amount = 10.00, repass_amount = 7.50 where id = $1`, [area1])
    await asUser(db, GESTOR, `update public.delivery_areas set charge_amount = 14.00, repass_amount = 10.00 where id = $1`, [area2])
    const hist = await asAdmin(db, `select * from public.delivery_fee_history where area_id = $1`, [area1])
    expect(hist.length).toBeGreaterThanOrEqual(2)
  })

  test("motoboy não altera valores de área", async () => {
    const rows = await asUser(db, MOTO1, `update public.delivery_areas set charge_amount = 99 where id = $1 returning id`, [area1])
    expect(rows).toHaveLength(0)
  })

  test("bairro associa a entrega à área automaticamente", async () => {
    await asUser(db, GESTOR, `insert into public.neighborhoods (company_id, name, area_id) values ($1, 'Chácara das Pedras', $2)`, [C1, area2])
    const [d] = await asUser<{ area_id: string; charge_amount: string; repass_amount: string }>(
      db, GESTOR,
      `insert into public.deliveries (company_id, comanda_number, delivery_date, delivery_time, address, address_number, neighborhood, city, state)
       values ($1, 'b-100', $2, '12:00', 'Rua das Flores', '10', 'chacara das pedras', 'Porto Alegre', 'rs')
       returning area_id, charge_amount, repass_amount`, [C1, today])
    expect(d.area_id).toBe(area2)
    expect(Number(d.charge_amount)).toBe(14)
    expect(Number(d.repass_amount)).toBe(10)
  })

  test("entrega persiste, normaliza e aparece no histórico de status", async () => {
    const [d] = await asUser<{ id: string; comanda_number: string; state: string }>(
      db, ADMINISTRATIVO,
      `insert into public.deliveries (comanda_number, delivery_date, delivery_time, address, area_id, motoboy_id, state)
       values (' a-001 ', $1, '11:00', 'Av. Brasil', $2, $3, 'rs') returning id, comanda_number, state`,
      [today, area1, moto1Id])
    expect(d.comanda_number).toBe("A-001")
    expect(d.state).toBe("RS")
    const hist = await asUser(db, ADMINISTRATIVO, `select * from public.delivery_status_history where delivery_id = $1`, [d.id])
    expect(hist).toHaveLength(1)
    const audit = await asAdmin(db, `select * from public.audit_logs where entity = 'deliveries' and entity_id = $1`, [d.id])
    expect(audit.length).toBeGreaterThan(0)
  })

  test("duplicidade da mesma comanda no mesmo dia é bloqueada", async () => {
    await expectError(
      asUser(db, ADMINISTRATIVO, `insert into public.deliveries (comanda_number, delivery_date, delivery_time, address) values ('A-001', $1, '11:30', 'Outra rua')`, [today]),
      /duplicate key|unique/,
    )
    const dups = await asUser(db, ADMINISTRATIVO, `select * from public.find_delivery_duplicates('a-001', $1::date, 'Av Brasil', null)`, [today])
    expect(dups.length).toBe(1)
  })

  test("extras automáticos aplicam uma única vez e manuais somam ao repasse", async () => {
    await asUser(db, GESTOR, `insert into public.extra_rules (company_id, name, kind, charge_amount, repass_amount, conditions) values ($1, 'Noturno', 'automatico', 3.00, 2.00, '{"start_time":"22:00","end_time":"06:00"}')`, [C1])
    const [d] = await asUser<{ id: string }>(db, GESTOR,
      `insert into public.deliveries (comanda_number, delivery_date, delivery_time, address, area_id, motoboy_id)
       values ('N-1', $1, '23:15', 'Rua Noite', $2, $3) returning id`, [today, area1, moto1Id])
    const autos = await asAdmin(db, `select * from public.delivery_extras where delivery_id = $1 and kind = 'automatico'`, [d.id])
    expect(autos).toHaveLength(1)

    // Reprocessar não duplica.
    await asUser(db, GESTOR, `update public.deliveries set delivery_time = '23:30' where id = $1`, [d.id])
    const autos2 = await asAdmin(db, `select * from public.delivery_extras where delivery_id = $1 and kind = 'automatico' and canceled_at is null`, [d.id])
    expect(autos2).toHaveLength(1)

    await asUser(db, GESTOR, `insert into public.delivery_extras (delivery_id, kind, description, charge_amount, repass_amount) values ($1, 'manual', 'Espera', 1.50, 1.00)`, [d.id])
    await asUser(db, GESTOR, `insert into public.delivery_extras (delivery_id, kind, description, charge_amount, repass_amount) values ($1, 'desconto', 'Avaria', 0, -0.50)`, [d.id])
    const [f] = await asUser<Record<string, string>>(db, GESTOR, `select charge_total, repass_gross, repass_net, extras_charge_total from public.delivery_financials where id = $1`, [d.id])
    expect(Number(f.charge_total)).toBe(10 + 3 + 1.5)
    expect(Number(f.repass_gross)).toBe(7.5 + 2 + 1)
    expect(Number(f.repass_net)).toBe(7.5 + 2 + 1 - 0.5)

    // Fora do horário, o automático é cancelado.
    await asUser(db, GESTOR, `update public.deliveries set delivery_time = '15:00' where id = $1`, [d.id])
    const [f2] = await asUser<Record<string, string>>(db, GESTOR, `select repass_net from public.delivery_financials where id = $1`, [d.id])
    expect(Number(f2.repass_net)).toBe(7.5 + 1 - 0.5)
  })

  test("usuário não consegue lançar extra automático manualmente nem alterar totais", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'A-001'`)
    const rule = await asAdmin<{ id: string }>(db, `select id from public.extra_rules limit 1`)
    await expectError(
      asUser(db, GESTOR, `insert into public.delivery_extras (delivery_id, rule_id, kind, description, charge_amount, repass_amount) values ($1, $2, 'automatico', 'fake', 0, 50)`, [d.id, rule[0].id]),
      /calculados pelo sistema/,
    )
    await asUser(db, GESTOR, `update public.deliveries set extras_repass_total = 999, payment_status = 'pago' where id = $1`, [d.id])
    const [row] = await asAdmin<Record<string, string>>(db, `select extras_repass_total, payment_status from public.deliveries where id = $1`, [d.id])
    expect(Number(row.extras_repass_total)).toBe(0)
    expect(row.payment_status).toBe("pendente")
  })

  test("administrativo sem financeiro.ajustar não lança desconto", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'A-001'`)
    await expectError(
      asUser(db, ADMINISTRATIVO, `insert into public.delivery_extras (delivery_id, kind, description, repass_amount) values ($1, 'desconto', 'x desconto', -1)`, [d.id]),
      /ajustes ou descontos/,
    )
  })
})

describe("motoboy", () => {
  test("visualiza apenas as próprias entregas", async () => {
    const mine = await asUser<{ motoboy_id: string }>(db, MOTO1, `select motoboy_id from public.deliveries`)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((r) => r.motoboy_id === moto1Id)).toBe(true)
    const other = await asUser(db, MOTO2, `select * from public.deliveries`)
    expect(other).toHaveLength(0)
  })

  test("não altera entregas diretamente nem de outro motoboy", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'A-001'`)
    const rows = await asUser(db, MOTO1, `update public.deliveries set address = 'x' where id = $1 returning id`, [d.id])
    expect(rows).toHaveLength(0)
    await expectError(asUser(db, MOTO2, `select public.set_my_delivery_status($1, 'entregue')`, [d.id]), /não encontrada|não pode/)
  })

  test("confirma 'Pedido entregue' com histórico e é idempotente", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'A-001'`)
    await asUser(db, MOTO1, `select public.set_my_delivery_status($1, 'entregue')`, [d.id])
    await asUser(db, MOTO1, `select public.set_my_delivery_status($1, 'entregue')`, [d.id])
    const hist = await asAdmin<{ from_status: string; to_status: string; changed_by: string }>(db, `select from_status, to_status, changed_by from public.delivery_status_history where delivery_id = $1 order by id`, [d.id])
    expect(hist).toHaveLength(2)
    expect(hist[1]).toMatchObject({ from_status: "pendente", to_status: "entregue", changed_by: MOTO1 })
    const [row] = await asAdmin<{ delivered_by: string }>(db, `select delivered_by from public.deliveries where id = $1`, [d.id])
    expect(row.delivered_by).toBe(MOTO1)
  })

  test("motoboy não desfaz confirmação; gestor corrige com justificativa", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'A-001'`)
    await expectError(asUser(db, MOTO1, `select public.correct_delivery_confirmation($1, 'pendente', 'teste motivo')`, [d.id]), /Sem permissão/)
    await asUser(db, GESTOR, `select public.correct_delivery_confirmation($1, 'pendente', 'Confirmado por engano')`, [d.id])
    await asUser(db, MOTO1, `select public.set_my_delivery_status($1, 'entregue')`, [d.id])
  })

  test("recebe notificação ao ser atribuído", async () => {
    const n = await asUser<{ title: string }>(db, MOTO1, `select title from public.notifications where category = 'entrega'`)
    expect(n.length).toBeGreaterThan(0)
  })
})

describe("pagamentos", () => {
  test("pagamento calcula valor no banco, é idempotente e impede duplicidade", async () => {
    const ids = await asAdmin<{ id: string }>(db, `select id from public.deliveries where motoboy_id = $1 and status = 'entregue'`, [moto1Id])
    const deliveryIds = ids.map((r) => r.id)
    const [p1] = await asUser<{ id: string; amount: string }>(db, GESTOR, `select * from public.create_payment($1, $2::uuid[], 'key-1')`, [moto1Id, deliveryIds])
    const [p2] = await asUser<{ id: string }>(db, GESTOR, `select * from public.create_payment($1, $2::uuid[], 'key-1')`, [moto1Id, deliveryIds])
    expect(p2.id).toBe(p1.id)
    expect(Number(p1.amount)).toBe(7.5)
    await expectError(asUser(db, GESTOR, `select public.create_payment($1, $2::uuid[], 'key-2')`, [moto1Id, deliveryIds]), /inválidas/)
  })

  test("transições de status validadas e refletidas na entrega", async () => {
    const [p] = await asAdmin<{ id: string }>(db, `select id from public.payments limit 1`)
    await expectError(asUser(db, GESTOR, `select public.set_payment_status($1, 'pago')`, [p.id]), /Transição inválida/)
    await expectError(asUser(db, ADMINISTRATIVO, `select public.set_payment_status($1, 'aprovado')`, [p.id]), /Sem permissão/)
    await asUser(db, GESTOR, `select public.set_payment_status($1, 'aprovado')`, [p.id])
    await asUser(db, GESTOR, `select public.set_payment_status($1, 'pago', now(), 'PIX', 'E2E123')`, [p.id])
    const [d] = await asAdmin<{ payment_status: string }>(db, `select payment_status from public.deliveries where comanda_number = 'A-001'`)
    expect(d.payment_status).toBe("pago")
    // Gestor não tem pagamentos.excluir; administrativo com a permissão concedida ainda esbarra na regra de estorno.
    await expectError(asUser(db, GESTOR, `select public.set_payment_status($1, 'cancelado', null, null, null, 'estorno')`, [p.id]), /Sem permissão/)
    await asUser(db, ADMIN, `insert into public.user_permissions (user_id, permission_key, allowed) values ($1, 'pagamentos.excluir', true)`, [GESTOR])
    await expectError(asUser(db, GESTOR, `select public.set_payment_status($1, 'cancelado', null, null, null, 'estorno')`, [p.id]), /administradores/)
    await asUser(db, ADMIN, `delete from public.user_permissions where user_id = $1`, [GESTOR])
  })

  test("motoboy não cria pagamentos e vê só os seus", async () => {
    await expectError(asUser(db, MOTO1, `select public.create_payment($1, array[]::uuid[], 'k')`, [moto1Id]), /Sem permissão/)
    const mine = await asUser(db, MOTO1, `select * from public.payments`)
    expect(mine).toHaveLength(1)
    const other = await asUser(db, MOTO2, `select * from public.payments`)
    expect(other).toHaveLength(0)
  })

  test("entrega paga não pode ser cancelada nem trocar de área", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'A-001'`)
    await expectError(asUser(db, GESTOR, `update public.deliveries set status = 'cancelada', cancel_reason = 'teste' where id = $1`, [d.id]), /não pode ser cancelada/)
    await expectError(asUser(db, GESTOR, `update public.deliveries set area_id = $2 where id = $1`, [d.id, area2]), /já foi aprovado ou pago/)
  })
})

describe("conferência por foto", () => {
  test("conferência exige aprovação manual por quem tem permissão", async () => {
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'B-100'`)
    const path = `${C1}/2026/10/teste.jpg`
    const [photo] = await asUser<{ id: string }>(db, ADMINISTRATIVO, `insert into public.delivery_photos (storage_path, mime_type, size_bytes, source) values ($1, 'image/jpeg', 1000, 'galeria') returning id`, [path])
    const [conf] = await asUser<{ id: string }>(db, ADMINISTRATIVO,
      `insert into public.delivery_conferences (photo_id, delivery_id, status, ocr_fields, divergence_count) values ($1, $2, 'aguardando_revisao', '{"comanda":"B-100"}', 1) returning id`,
      [photo.id, d.id])
    const [del] = await asAdmin<{ has_divergence: boolean; conference_status: string }>(db, `select has_divergence, conference_status from public.deliveries where id = $1`, [d.id])
    expect(del).toMatchObject({ has_divergence: true, conference_status: "aguardando" })

    await expectError(asUser(db, ADMINISTRATIVO, `update public.delivery_conferences set status = 'aprovada' where id = $1`, [conf.id]), /Sem permissão/)
    const notes = await asUser(db, GESTOR, `select * from public.notifications where category = 'divergencia'`)
    expect(notes.length).toBeGreaterThan(0)
    await asUser(db, GESTOR, `update public.delivery_conferences set status = 'aprovada', notes = 'Conferido manualmente' where id = $1`, [conf.id])
    const [del2] = await asAdmin<{ has_divergence: boolean; conference_status: string }>(db, `select has_divergence, conference_status from public.deliveries where id = $1`, [d.id])
    expect(del2).toMatchObject({ has_divergence: false, conference_status: "aprovada" })
    await expectError(asUser(db, GESTOR, `update public.delivery_conferences set status = 'rejeitada' where id = $1`, [conf.id]), /já foi revisada/)
  })

  test("falha de OCR gera notificação real", async () => {
    await asUser(db, MOTO1, `insert into public.delivery_conferences (status, error_message) values ('falha_ocr', 'Imagem ilegível')`)
    const n = await asUser(db, GESTOR, `select * from public.notifications where category = 'falha_ocr'`)
    expect(n.length).toBeGreaterThan(0)
  })

  test("foto com caminho de outra empresa é rejeitada", async () => {
    await expectError(
      asUser(db, ADMINISTRATIVO, `insert into public.delivery_photos (storage_path, mime_type, size_bytes, source) values ($1, 'image/jpeg', 10, 'camera')`, [`${C2}/x.jpg`]),
      /Caminho de armazenamento inválido/,
    )
  })
})

describe("fechamento quinzenal", () => {
  test("consolida, aprova, encerra e bloqueia alterações", async () => {
    const [c] = await asUser<{ id: string; totals: Record<string, string>; status: string }>(
      db, GESTOR, `select * from public.closing_generate($1::date, $1::date)`, [today])
    expect(c.status).toBe("consolidado")
    const items = await asUser<{ net_total: string; paid_total: string }>(db, GESTOR, `select * from public.closing_items where closing_id = $1`, [c.id])
    const [sum] = await asUser<{ net: string }>(db, GESTOR, `select coalesce(sum(repass_net),0) net from public.delivery_financials where delivery_date = $1 and status = 'entregue' and motoboy_id is not null`, [today])
    expect(items.reduce((s, i) => s + Number(i.net_total), 0)).toBeCloseTo(Number(sum.net), 2)
    expect(Number(c.totals.net_total)).toBeCloseTo(Number(sum.net), 2)

    const id = c.id
    await expectError(asUser(db, ADMINISTRATIVO, `select public.closing_approve($1)`, [id]), /Sem permissão/)
    await asUser(db, GESTOR, `select public.closing_approve($1)`, [id])
    await asUser(db, GESTOR, `select public.closing_close($1)`, [id])

    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'B-100'`)
    await expectError(asUser(db, GESTOR, `update public.deliveries set notes = 'mudança' where id = $1`, [d.id]), /encerrado/)
    await expectError(
      asUser(db, ADMINISTRATIVO, `insert into public.deliveries (comanda_number, delivery_date, delivery_time, address) values ('Z-9', $1, '10:00', 'Rua Z')`, [today]),
      /encerrado/,
    )

    // Correção autorizada com justificativa.
    await expectError(asUser(db, GESTOR, `select public.correct_closed_delivery($1, '{"notes":"x"}', 'curto')`, [d.id]), /Sem permissão|justificativa/)
    await asUser(db, ADMIN, `select public.correct_closed_delivery($1, '{"notes":"Ajuste de endereço"}', 'Cliente informou complemento errado')`, [d.id])
    const audit = await asAdmin<{ reason: string }>(db, `select reason from public.audit_logs where entity = 'deliveries' and entity_id = $1 and reason like 'Correção%'`, [d.id])
    expect(audit.length).toBeGreaterThan(0)

    // Reabertura exige permissão e justificativa.
    await expectError(asUser(db, ADMINISTRATIVO, `select public.closing_reopen($1, 'motivo qualquer longo')`, [id]), /Sem permissão/)
    await asUser(db, ADMIN, `select public.closing_reopen($1, 'Reabertura para revisão de extras')`, [id])
    await asUser(db, GESTOR, `update public.deliveries set notes = 'liberado' where id = $1`, [d.id])
  })

  test("aprovação falha se os dados mudarem após a consolidação", async () => {
    const [c] = await asUser<{ id: string }>(db, GESTOR, `select * from public.closing_generate($1::date, $1::date)`, [today])
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where comanda_number = 'B-100'`)
    await asUser(db, GESTOR, `update public.deliveries set notes = 'alterada depois' where id = $1`, [d.id])
    await expectError(asUser(db, GESTOR, `select public.closing_approve($1)`, [c.id]), /alterados após a consolidação/)
  })
})

describe("isolamento multiempresa", () => {
  test("empresa 2 não enxerga nem altera dados da empresa 1", async () => {
    for (const table of ["deliveries", "delivery_extras", "payments", "motoboys", "delivery_areas", "closing_periods", "audit_logs", "notifications", "profiles", "delivery_conferences", "app_settings"]) {
      const rows = await asUser<{ company_id?: string }>(db, OTHER_ADMIN, `select * from public.${table}`)
      expect(rows.every((r) => !r.company_id || r.company_id === C2), table).toBe(true)
    }
    const [d] = await asAdmin<{ id: string }>(db, `select id from public.deliveries where company_id = $1 limit 1`, [C1])
    const upd = await asUser(db, OTHER_ADMIN, `update public.deliveries set notes = 'invasão' where id = $1 returning id`, [d.id])
    expect(upd).toHaveLength(0)
    await expectError(asUser(db, OTHER_ADMIN, `select public.set_payment_status((select id from public.payments limit 1), 'cancelado')`), /não encontrado|null/)
  })

  test("inserção forçando company_id de outra empresa é reescrita para a empresa do usuário", async () => {
    const [row] = await asUser<{ company_id: string }>(db, OTHER_ADMIN,
      `insert into public.deliveries (company_id, comanda_number, delivery_date, delivery_time, address) values ($1, 'C2-1', $2, '10:00', 'Rua X') returning company_id`, [C1, today])
    expect(row.company_id).toBe(C2)
  })

  test("anônimo não acessa nada", async () => {
    await expectError(asUser(db, null, `select * from public.deliveries`), /permission denied/)
  })
})

describe("painel", () => {
  test("indicadores calculados no banco", async () => {
    const [r] = await asUser<{ s: Record<string, number> }>(db, GESTOR, `select public.dashboard_summary($1::date, $1::date) s`, [today])
    const [count] = await asUser<{ n: number }>(db, GESTOR, `select count(*)::int n from public.deliveries where delivery_date = $1`, [today])
    expect(r.s.total).toBe(count.n)
    const alerts = await asUser<{ a: unknown[] }>(db, GESTOR, `select public.operational_alerts($1::date) a`, [today])
    expect(Array.isArray(alerts[0].a)).toBe(true)
  })

  test("notificações: marcar como lidas sem alterar conteúdo", async () => {
    await asUser(db, MOTO1, `update public.notifications set title = 'hack', read_at = now()`)
    const rows = await asUser<{ title: string; read_at: string }>(db, MOTO1, `select title, read_at from public.notifications`)
    expect(rows.every((r) => r.title !== "hack" && r.read_at)).toBe(true)
  })
})
