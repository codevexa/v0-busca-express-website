"use client"

import { LogOut, Menu, UserRound, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Logo } from "@/components/ossala/logo"
import { NetworkStatus } from "@/components/ossala/network-status"
import { NotificationBell } from "@/components/ossala/notification-bell"
import { useSession } from "@/components/ossala/session-provider"
import { ROLE_LABELS } from "@/lib/domain"
import { NAV_GROUP_LABELS, NAV_ITEMS, type NavItem } from "@/lib/navigation"
import { can } from "@/lib/permissions"
import { cn } from "@/lib/utils"

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, logoUrl } = useSession()
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const items = useMemo(() => {
    const motoboy = session.role === "MOTOBOY"
    return NAV_ITEMS.filter((item) => {
      if (item.motoboy === true && !motoboy) return false
      if (item.motoboy === false && motoboy) return false
      return item.anyOf.length === 0 || item.anyOf.some((k) => can(session, k))
    })
  }, [session])

  const primary = items.filter((i) => i.mobilePrimary).slice(0, 4)
  const grouped = useMemo(() => {
    const g = new Map<NavItem["group"], NavItem[]>()
    for (const item of items) {
      const list = g.get(item.group) ?? []
      list.push(item)
      g.set(item.group, list)
    }
    return g
  }, [items])

  const companyName = session.company.name || "OSSALA"

  return (
    <div className="ossala min-h-dvh">
      <NetworkStatus />
      {/* Menu lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link href="/app">
            <Logo url={logoUrl} name={companyName} />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu principal">
          {[...grouped.entries()].map(([group, list]) => (
            <div key={group} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-[#b48a4a] uppercase">
                {NAV_GROUP_LABELS[group]}
              </p>
              <ul className="space-y-0.5">
                {list.map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-semibold text-[#d4af37]"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-[#e8c98e]",
                        )}
                      >
                        <item.icon className={cn("size-4", active ? "text-[#d4af37]" : "text-[#800020]")} />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-xs text-muted-foreground">
          <p className="truncate font-medium text-foreground">{session.nome}</p>
          <p>
            {ROLE_LABELS[session.role]} · Matrícula {session.matricula}
          </p>
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Cabeçalho */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:h-16 lg:px-6">
          <Link href="/app" className="lg:hidden">
            <Logo url={logoUrl} name={companyName} size="sm" />
          </Link>
          <div className="hidden text-sm text-muted-foreground lg:block">
            {companyName} · Controle de Entregas
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Minha conta">
                  <UserRound className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <span className="block font-medium text-foreground">{session.nome}</span>
                  {ROLE_LABELS[session.role]}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/perfil">
                    <UserRound /> Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <form action="/api/auth/logout" method="post" className="w-full">
                    <button type="submit" className="flex w-full items-center gap-2">
                      <LogOut className="size-4" /> Sair
                    </button>
                  </form>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 lg:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar/95 backdrop-blur lg:hidden"
        aria-label="Navegação principal"
      >
        <ul className="grid grid-cols-5">
          {primary.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px]",
                    active ? "text-[#d4af37]" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-5" />
                  <span className="max-w-full truncate px-1">{item.label.split(" ")[0]}</span>
                </Link>
              </li>
            )
          })}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
            >
              <Menu className="size-5" />
              Mais
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Mais opções">
          <button className="absolute inset-0 bg-black/70" onClick={() => setMoreOpen(false)} aria-label="Fechar" />
          <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-semibold text-[#e8c98e]">Menu</span>
              <Button variant="ghost" size="icon" onClick={() => setMoreOpen(false)} aria-label="Fechar">
                <X />
              </Button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {[...items, { href: "/app/perfil", label: "Meu perfil", icon: UserRound, anyOf: [], group: "administracao" as const }].map(
                (item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border p-2 text-center text-xs",
                        isActive(pathname, item.href) ? "border-[#d4af37]/60 text-[#d4af37]" : "text-foreground",
                      )}
                    >
                      <item.icon className="size-5 text-[#b48a4a]" />
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
            <form action="/api/auth/logout" method="post" className="mt-4">
              <Button type="submit" variant="outline" className="w-full">
                <LogOut /> Sair
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
