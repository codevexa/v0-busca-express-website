"use client"

import { Bell } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { getBrowserSupabase } from "@/lib/supabase/client"
import { useSession } from "@/components/ossala/session-provider"

export function NotificationBell() {
  const { session } = useSession()
  const [unread, setUnread] = useState<number | null>(null)

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase()
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", session.user_id)
      .is("read_at", null)
    if (!error) setUnread(count ?? 0)
  }, [session.user_id])

  useEffect(() => {
    load()
    const supabase = getBrowserSupabase()
    const channel = supabase
      .channel(`notifications:${session.user_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${session.user_id}` },
        () => load(),
      )
      .subscribe()
    const interval = setInterval(load, 60_000)
    const onFocus = () => load()
    window.addEventListener("focus", onFocus)
    window.addEventListener("ossala:notifications-changed", onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("ossala:notifications-changed", onFocus)
      supabase.removeChannel(channel)
    }
  }, [load, session.user_id])

  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label="Notificações">
      <Link href="/app/alertas">
        <Bell className="size-5" />
        {!!unread && unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-[#800020] px-1 text-[10px] font-bold text-[#d4af37] ring-2 ring-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}
