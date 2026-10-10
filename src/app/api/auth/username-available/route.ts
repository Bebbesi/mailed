import { z } from "zod";
import { publicRoute, readQuery } from "@/lib/api/handler";
import { primaryDomain } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isAddressAvailable, usernameSchema } from "@/lib/services/auth";

export const GET = publicRoute(async ({ req, ip }) => {
  await enforceRateLimit(`username-check:${ip}`, 60, 300);
  const { u } = readQuery(req, z.object({ u: z.string().max(64) }));
  const parsed = usernameSchema.safeParse(u);
  if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message, domain: primaryDomain() };
  return { available: await isAddressAvailable(parsed.data), domain: primaryDomain() };
});
