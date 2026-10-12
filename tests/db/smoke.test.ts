import { test, expect } from "vitest"
import { createDb } from "./harness"

test("migrations aplicam do zero", async () => {
  const db = await createDb()
  const r = await db.query<{ n: number }>("select count(*)::int n from public.permissions")
  expect(r.rows[0].n).toBeGreaterThan(40)
}, 120000)
