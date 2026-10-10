import { z } from "zod";
import { SYSTEM_VIEWS, type ViewRef } from "@/lib/types";

export const viewQuerySchema = z.object({
  view: z.enum(SYSTEM_VIEWS).optional(),
  label: z.string().uuid().optional(),
  q: z.string().max(500).optional(),
  filter: z.string().max(500).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(10).max(100).optional(),
});

export function toViewRef(q: z.infer<typeof viewQuerySchema>): ViewRef {
  if (q.q !== undefined && q.q.trim()) return { kind: "search", query: q.q };
  if (q.label) return { kind: "label", labelId: q.label };
  return { kind: "system", view: q.view ?? "inbox" };
}
