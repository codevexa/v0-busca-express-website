import { Badge } from "@/components/ui/badge"
import {
  CLOSING_STATUS,
  CONFERENCE_STATUS,
  DELIVERY_STATUS,
  PAYMENT_STATUS,
  type ClosingStatus,
  type ConferenceStatus,
  type DeliveryStatus,
  type PaymentStatus,
} from "@/lib/domain"

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const s = DELIVERY_STATUS[status] ?? { label: status, tone: "muted" as const }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const s = PAYMENT_STATUS[status] ?? { label: status, tone: "muted" as const }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function ConferenceStatusBadge({ status }: { status: ConferenceStatus }) {
  const s = CONFERENCE_STATUS[status] ?? { label: status, tone: "muted" as const }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function ClosingStatusBadge({ status }: { status: ClosingStatus }) {
  const s = CLOSING_STATUS[status] ?? { label: status, tone: "muted" as const }
  return <Badge tone={s.tone}>{s.label}</Badge>
}
