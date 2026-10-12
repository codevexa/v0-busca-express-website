"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Pagination({
  page,
  pageSize,
  count,
  onPage,
}: {
  page: number
  pageSize: number
  count: number
  onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (count <= pageSize) {
    return <p className="mt-3 text-xs text-muted-foreground">{count} registro(s)</p>
  }
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-muted-foreground">
        {page * pageSize + 1}–{Math.min(count, (page + 1) * pageSize)} de {count}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft />
        </Button>
        <span className="px-2 text-xs">
          {page + 1} / {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
