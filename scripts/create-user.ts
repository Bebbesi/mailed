/**
 * Creates a mailbox from the command line (useful for first setup):
 *   npm run user:create -- --username alice --first Alice --last Rossi --recovery alice@example.org --password '...'
 * The recovery email is marked as verified.
 */
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";

async function main() {
  const { values } = parseArgs({
    options: {
      username: { type: "string" },
      first: { type: "string" },
      last: { type: "string" },
      recovery: { type: "string" },
      password: { type: "string" },
    },
  });
  const { db, closeDb } = await import("../src/lib/db");
  const { users } = await import("../src/lib/db/schema");
  const { registerSchema, registerUser } = await import("../src/lib/services/auth");
  const input = registerSchema.parse({
    username: values.username,
    firstName: values.first,
    lastName: values.last,
    recoveryEmail: values.recovery,
    password: values.password,
  });
  const { user } = await registerUser(input);
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  console.log(`Created ${user.address}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
