/**
 * Rebuilds the displayed HTML of received mail from the stored originals, e.g.
 * after a sanitiser update:  npm run mail:rerender
 */
async function main() {
  const { closeDb } = await import("../src/lib/db");
  const { rerenderStoredHtml } = await import("../src/lib/mail/rerender");
  const result = await rerenderStoredHtml({ onProgress: (n) => process.stdout.write(`\rChecked ${n} messages…`) });
  process.stdout.write("\n");
  console.log(`Updated ${result.updated} of ${result.checked} messages${result.failed ? ` (${result.failed} could not be read)` : ""}.`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
