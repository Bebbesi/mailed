import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const id = Date.now().toString(36);
const user = { first: "Erica", last: "Tester", username: `e2e${id}`, recovery: `e2e-${id}@example.org`, password: "e2e-correct-horse-battery" };

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/app/inbox");
}

test.describe.configure({ mode: "serial" });

test("public pages are accessible", async ({ page }) => {
  for (const path of ["/", "/login", "/register", "/forgot-password", "/privacy"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await axe(page);
  }
});

test("registers, lands in the inbox and signs out", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("First name").fill(user.first);
  await page.getByLabel("Last name").fill(user.last);
  await page.getByLabel("Mailed address").fill(user.username);
  await expect(page.getByText("is available")).toBeVisible();
  await page.getByLabel("Recovery email").fill(user.recovery);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("checkbox", { name: "Accept terms" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/app/inbox**");
  await expect(page.getByRole("heading", { name: "You're all caught up" })).toBeVisible();
  await expect(page.getByText(/Confirm your recovery email/)).toBeVisible();
  await axe(page);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.goto("/app/inbox");
  await page.waitForURL("**/login?next=*");
});

test("sends a message to itself and reads it", async ({ page }) => {
  await signIn(page);

  await page.keyboard.press("c");
  const composer = page.getByRole("region", { name: "New message" });
  await composer.getByRole("combobox").fill(`${user.username}@mailed.local`);
  await composer.getByRole("combobox").press("Enter");
  await composer.getByPlaceholder("Subject").fill("Note to self");
  await composer.getByRole("textbox", { name: "Message body" }).fill("Remember to water the plants.");
  await composer.getByRole("button", { name: "Send", exact: true }).click();

  await expect(page.getByRole("link", { name: /Note to self/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: /Note to self/ }).first().click();
  await expect(page.getByRole("heading", { name: "Note to self" })).toBeVisible();
  await expect(page.getByText("Remember to water the plants.").first()).toBeVisible();
  await axe(page);

  await page.goto("/app/search?q=plants");
  await expect(page.getByRole("link", { name: /Note to self/ }).first()).toBeVisible();
});

test("settings and contacts are accessible", async ({ page }) => {
  await signIn(page);
  for (const tab of ["general", "account", "filters", "security", "data"]) {
    await page.goto(`/app/settings?tab=${tab}`);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await axe(page);
  }
  await page.goto("/app/contacts");
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await axe(page);
});

test("layout adapts to phone, tablet and desktop widths", async ({ page }) => {
  await signIn(page);
  for (const [w, h] of [
    [390, 844],
    [820, 1180],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/app/sent");
    await expect(page.getByRole("link", { name: /Note to self/ }).first()).toBeVisible();
    await noHorizontalOverflow(page);
    if (w < 1024) {
      await page.getByRole("button", { name: w < 768 ? "Open navigation" : "Show all folders" }).click();
      await expect(page.getByRole("dialog").getByRole("link", { name: "Inbox", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByRole("navigation", { name: "Mailboxes" }).getByRole("link", { name: "Inbox", exact: true })).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await noHorizontalOverflow(page);
});
