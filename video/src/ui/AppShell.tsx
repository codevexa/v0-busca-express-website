import { Bell, UserRound } from "lucide-react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ossala/logo"
import { ROLE_LABELS, type Role } from "@/lib/domain"
import { NAV_GROUP_LABELS, NAV_ITEMS, type NavItem } from "@/lib/navigation"
import { can } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { COMPANY, ROLE_DEFAULTS, SESSION_USER } from "../data/demo"

export const WIN_W = 1600
export const WIN_H = 960

/** Itens do menu exatamente como o AppShell real filtra (NAV_ITEMS + can()). */
export function navItemsFor(role: Role) {
  const permissions = role === "ADMIN" ? [] : ROLE_DEFAULTS[role]
  const session = { role, permissions }
  const motoboy = role === "MOTOBOY"
  return NAV_ITEMS.filter((item) => {
    if (item.motoboy === true && !motoboy) return false
    if (item.motoboy === false && motoboy) return false
    return item.anyOf.length === 0 || item.anyOf.some((k) => can(session, k))
  })
}

export function groupNav(items: NavItem[]) {
  const g = new Map<NavItem["group"], NavItem[]>()
  for (const item of items) g.set(item.group, [...(g.get(item.group) ?? []), item])
  return [...g.entries()]
}

/**
 * Réplica estática de components/ossala/app-shell.tsx (versão computador),
 * com as mesmas classes, o mesmo menu e o mesmo cabeçalho.
 * `reveal` (0..1) anima a entrada do menu lateral.
 */
export function AppShell({
  active,
  children,
  reveal = 1,
  unread = 3,
  role = SESSION_USER.role,
}: {
  active: string
  children: React.ReactNode
  reveal?: number
  unread?: number
  role?: Role
}) {
  const items = navItemsFor(role)
  let index = 0
  return (
    <div className="ossala relative overflow-hidden" style={{ width: WIN_W, height: WIN_H }}>
      <aside className="absolute inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Logo name={COMPANY} />
        </div>
        <nav className="flex-1 overflow-hidden px-3 py-4" aria-label="Menu principal">
          {groupNav(items).map(([group, list]) => (
            <div key={group} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-[#b48a4a] uppercase">{NAV_GROUP_LABELS[group]}</p>
              <ul className="space-y-0.5">
                {list.map((item) => {
                  const isActive = item.href === active
                  const i = index++
                  const p = Math.min(1, Math.max(0, reveal * 22 - i))
                  return (
                    <li key={item.href} style={{ opacity: p, transform: `translateX(${(1 - p) * -14}px)` }}>
                      <span
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                          isActive ? "bg-sidebar-accent font-semibold text-[#d4af37]" : "text-sidebar-foreground/80",
                        )}
                      >
                        <item.icon className={cn("size-4", isActive ? "text-[#d4af37]" : "text-[#800020]")} />
                        {item.label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-xs text-muted-foreground">
          <p className="truncate font-medium text-foreground">{SESSION_USER.nome}</p>
          <p>
            {ROLE_LABELS[SESSION_USER.role]} · Matrícula {SESSION_USER.matricula}
          </p>
        </div>
      </aside>

      <div className="pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-border bg-background/90 px-6 backdrop-blur">
          <div className="text-sm text-muted-foreground">{COMPANY} · Controle de Entregas</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-[#800020] px-1 text-[10px] font-bold text-[#d4af37] ring-2 ring-background">
                  {unread}
                </span>
              )}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Minha conta">
              <UserRound className="size-5" />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-6 pt-5 pb-10">{children}</main>
      </div>
    </div>
  )
}
