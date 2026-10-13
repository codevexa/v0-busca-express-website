import { KeyRound, Loader2, Pencil, RefreshCw, ShieldCheck, UserPlus } from "lucide-react"
import { AbsoluteFill, useCurrentFrame } from "remotion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Logo } from "@/components/ossala/logo"
import { PageHeader } from "@/components/ossala/page-header"
import { ROLE_LABELS, type Role } from "@/lib/domain"
import { NAV_GROUP_LABELS } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { COMPANY, PERMISSION_SAMPLE, ROLE_DEFAULTS, USERS } from "../data/demo"
import { easeInOut, progress, rise, tween, type CursorKey } from "../lib/anim"
import { AnchorProbe } from "../ui/AnchorProbe"
import { AppShell, groupNav, navItemsFor } from "../ui/AppShell"
import { Backdrop } from "../ui/Backdrop"
import { Camera, Window } from "../ui/Camera"
import { Cursor } from "../ui/Cursor"
import { DialogFrame, FakeInput, FakeSelect, flash, OptionsMenu, Toast } from "../ui/Overlays"
import { SceneLabel } from "../ui/SceneLabel"

const T = { cursorIn: 30, clickPerm: 66, dialog: 70, clickTri: 104, pickTri: 126, clickSave: 146, close: 150, partB: 168 }

/** Posições medidas com a AnchorProbe. */
const A = { perm: [1388, 517], tri: [994, 440], save: [1085, 718] }

const roleTone = (r: Role) => (r === "ADMIN" ? "gold" : r === "MOTOBOY" ? "info" : "outline") as "gold" | "info" | "outline"

function UsersPage({ frame }: { frame: number }) {
  return (
    <>
      <PageHeader
        title="Usuários"
        description="Contas de acesso por matrícula, funções e permissões."
        actions={
          <>
            <Button variant="outline">
              <RefreshCw /> Atualizar
            </Button>
            <Button>
              <UserPlus /> Novo usuário
            </Button>
          </>
        }
      />
      <Tabs value="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="papeis">Permissões por função</TabsTrigger>
        </TabsList>
        <div>
          <FakeInput value="" placeholder="Buscar por nome ou matrícula" className="mb-3 max-w-sm" />
          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {USERS.map((u, i) => {
                  const self = i === 0
                  return (
                    <TableRow key={u.matricula} style={rise(frame, 6 + i * 3, 10, 14)}>
                      <TableCell className="font-medium">
                        {u.nome}
                        {self && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}
                        {u.pending && <div className="text-xs text-amber-200">Troca de senha pendente</div>}
                      </TableCell>
                      <TableCell>{u.matricula}</TableCell>
                      <TableCell>
                        <Badge tone={roleTone(u.role)}>{ROLE_LABELS[u.role]}</Badge>
                      </TableCell>
                      <TableCell>{u.ativo ? <Badge tone="success">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}</TableCell>
                      <TableCell className="text-xs">{u.last ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {!self && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost">
                              <Pencil /> Editar
                            </Button>
                            {u.role !== "ADMIN" && (
                              <Button size="sm" variant="ghost" data-anchor={u.nome === "Juliana Costa" ? "perm" : undefined}>
                                <ShieldCheck /> Permissões
                              </Button>
                            )}
                            <Button size="sm" variant="ghost">
                              <KeyRound /> Senha
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </Tabs>
    </>
  )
}

/** UserPermissionsDialog (usuarios-client.tsx), mostrando os módulos Pagamentos e Conferência. */
function PermissionsDialog({ frame }: { frame: number }) {
  const defaults = new Set(ROLE_DEFAULTS.ADMINISTRATIVO)
  const granted = frame >= T.pickTri
  const glow = flash(frame, T.pickTri, 40)
  const modules = [...new Set(PERMISSION_SAMPLE.map((p) => p.module))]
  return (
    <DialogFrame frame={frame} openAt={T.dialog} closeAt={T.close} className="max-w-3xl">
      <div className="flex flex-col gap-1.5 pr-6 text-left">
        <div className="text-lg leading-none font-semibold text-[#e8c98e]">Permissões de Juliana Costa</div>
        <div className="text-sm text-muted-foreground">
          Função: Administrativo. Ajustes individuais prevalecem sobre o padrão da função. As permissões também são verificadas no
          servidor e no banco de dados.
        </div>
      </div>
      <div className="space-y-4 pr-1">
        {modules.map((module) => (
          <section key={module}>
            <h3 className="mb-1 text-sm font-semibold text-[#e8c98e]">{module}</h3>
            <ul className="divide-y divide-border rounded-md border border-border">
              {PERMISSION_SAMPLE.filter((p) => p.module === module).map((p) => {
                const target = p.key === "pagamentos.aprovar"
                const override = target && granted
                const effective = override || defaults.has(p.key)
                return (
                  <li
                    key={p.key}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm"
                    style={target ? { background: `rgba(52,211,153,${0.12 * glow})` } : undefined}
                  >
                    <span>{p.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="relative w-40" data-anchor={target ? "tri" : undefined}>
                        <FakeSelect value={override ? "Conceder" : "Padrão da função"} className="h-8 text-xs" focused={target && frame >= T.clickTri && frame < T.pickTri + 8} />
                        {target && (
                          <div className="absolute" style={{ top: -6, left: 0 }}>
                            <OptionsMenu
                              frame={frame}
                              openAt={T.clickTri + 2}
                              closeAt={T.pickTri + 2}
                              options={["Padrão da função", "Conceder", "Revogar"]}
                              highlighted={frame >= T.pickTri - 10 ? 1 : 0}
                              width={160}
                            />
                          </div>
                        )}
                      </div>
                      <span className={cn("w-16 text-xs", effective ? "text-emerald-300" : "text-muted-foreground")}>
                        {effective ? "Permitido" : "Negado"}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex flex-row justify-end gap-2">
        <Button variant="outline">Cancelar</Button>
        <Button data-anchor="save">
          {frame >= T.clickSave && <Loader2 className="animate-spin" />} Salvar permissões
        </Button>
      </div>
    </DialogFrame>
  )
}

/** Menu lateral de cada função, filtrado pela mesma regra do AppShell (NAV_ITEMS + can + permissões padrão). */
function RolePanel({ role, frame, start }: { role: Role; frame: number; start: number }) {
  const items = navItemsFor(role)
  let index = 0
  const permCount = role === "ADMIN" ? "Acesso completo" : `${ROLE_DEFAULTS[role].length} permissões padrão`
  return (
    <div
      className="ossala flex w-72 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar"
      style={{ boxShadow: "0 50px 100px -30px rgba(0,0,0,0.9), 0 0 80px -30px rgba(128,0,32,0.6)", borderColor: "rgba(212,175,55,0.25)" }}
    >
      <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-4">
        <Logo name={COMPANY} size="sm" />
        <Badge tone={roleTone(role)}>{ROLE_LABELS[role]}</Badge>
      </div>
      <nav className="px-3 py-3">
        {groupNav(items).map(([group, list]) => (
          <div key={group} className="mb-2">
            <p className="mb-0.5 px-3 text-[11px] font-semibold tracking-wider text-[#b48a4a] uppercase">{NAV_GROUP_LABELS[group]}</p>
            <ul className="space-y-0.5">
              {list.map((item) => {
                const i = index++
                return (
                  <li key={item.href} style={rise(frame, start + 10 + i * 2, 10, 12)}>
                    <span className="flex items-center gap-3 rounded-md px-3 py-[5px] text-sm text-sidebar-foreground/80">
                      <item.icon className="size-4 text-[#800020]" />
                      {item.label}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-sidebar-border px-5 py-3 text-xs text-muted-foreground">
        {items.length} telas · {permCount}
      </div>
    </div>
  )
}

function AccessLevels({ frame }: { frame: number }) {
  const local = frame - T.partB
  const roles: Role[] = ["ADMIN", "ADMINISTRATIVO", "MOTOBOY"]
  const title = progress(local, 4, 20)
  const drift = local * 0.04
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 48 }}>
      <div style={{ textAlign: "center", opacity: title, transform: `translateY(${(1 - title) * 16}px)` }}>
        <div style={{ fontFamily: "Geist Mono", fontSize: 15, letterSpacing: "0.12em", color: "#d4af37" }}>05 — NÍVEIS DE ACESSO</div>
        <div style={{ marginTop: 10, fontSize: 40, fontWeight: 700, color: "#f3eee6", letterSpacing: "-0.01em" }}>
          Cada função vê somente o que pode acessar
        </div>
        <div style={{ marginTop: 8, fontSize: 19, color: "#b3a79c" }}>
          Permissões verificadas na interface, no servidor e no banco de dados (RLS).
        </div>
      </div>
      <div style={{ marginTop: 30, display: "flex", gap: 64, perspective: 2200, alignItems: "flex-start" }}>
        {roles.map((r, i) => {
          const p = progress(local, 10 + i * 8, 26)
          const rotY = (i - 1) * -14 * (1 - p * 0.35) + Math.sin(drift + i) * 1.5
          return (
            <div
              key={r}
              style={{
                opacity: p,
                transform: `translateY(${(1 - p) * 80 + (i === 1 ? -8 : 8)}px) rotateY(${rotY}deg) scale(${0.9 + p * 0.06})`,
                transformOrigin: "center top",
              }}
            >
              <RolePanel role={r} frame={local} start={14 + i * 8} />
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

/** Cena 6 — Gestão e permissões: usuários, ajuste individual de permissão e menus por função. */
export function Permissions({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const k = [0, 30, T.dialog, T.dialog + 16, T.clickSave, T.partB]
  const cam = {
    fx: tween(frame, k, [800, 860, 1120, 820, 860, 860]),
    fy: tween(frame, k, [470, 420, 480, 470, 500, 480]),
    zoom: tween(frame, k, [0.98, 1.28, 1.36, 1.42, 1.42, 1.1]),
    rotY: tween(frame, [0, 30], [5, 0]),
    rotX: tween(frame, [0, 30], [6, 0]),
  }
  const partA = 1 - progress(frame, T.partB - 6, 18, easeInOut)
  const partB = progress(frame, T.partB, 16, easeInOut)
  const pointer: CursorKey[] = [
    { f: T.cursorIn, x: 1100, y: 560 },
    { f: T.clickPerm - 6, x: A.perm[0], y: A.perm[1] },
    { f: T.clickPerm, x: A.perm[0], y: A.perm[1], click: true },
    { f: T.clickTri - 8, x: A.tri[0], y: A.tri[1] },
    { f: T.clickTri, x: A.tri[0], y: A.tri[1], click: true },
    { f: T.pickTri - 6, x: A.tri[0], y: A.tri[1] + 74 },
    { f: T.pickTri, x: A.tri[0], y: A.tri[1] + 74, click: true },
    { f: T.clickSave - 8, x: A.save[0], y: A.save[1] },
    { f: T.clickSave, x: A.save[0], y: A.save[1], click: true },
    { f: T.close + 20, x: A.save[0] + 120, y: A.save[1] + 80 },
  ]
  return (
    <AbsoluteFill>
      <Backdrop frame={frame + 1400} />
      {partA > 0 && (
        <AbsoluteFill style={{ opacity: partA, filter: partA < 1 ? `blur(${(1 - partA) * 8}px)` : undefined }}>
          <Camera state={cam}>
            <Window>
              <AppShell active="/app/usuarios">
                <UsersPage frame={frame} />
              </AppShell>
              <PermissionsDialog frame={frame} />
              <Toast frame={frame} at={T.close + 2} text="Permissões atualizadas." duration={40} />
              <Cursor frame={frame} keys={pointer} scale={0.85} visibleFrom={T.cursorIn} hideAfter={T.close + 16} />
              <AnchorProbe tag={`perm@${frame}`} />
            </Window>
          </Camera>
          <SceneLabel
            frame={frame}
            duration={duration}
            index="05 — GESTÃO E PERMISSÕES"
            title="Acesso sob medida para cada pessoa"
            subtitle="Usuários por matrícula, funções e ajustes individuais de permissão."
            from={20}
            until={T.partB - 4}
          />
        </AbsoluteFill>
      )}
      {partB > 0 && (
        <AbsoluteFill style={{ opacity: partB * (1 - progress(frame, duration - 14, 14)) }}>
          <AccessLevels frame={frame} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
