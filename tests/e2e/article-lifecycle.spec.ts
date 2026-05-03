import { test, expect } from "@playwright/test";

/**
 * Full ingest -> process -> article assertion.
 *
 * Logs in as admin via the UI to obtain a NextAuth session cookie, then
 * exercises /api/ingest and /api/process and verifies that:
 *   - the response is 200
 *   - the resulting article has `tags`, `steps`, `relatedLinks` as native
 *     `string[]` (the bug we hit when migrating SQLite -> Postgres)
 */
test("admin can ingest text and process it into an article with array tags", async ({ page, request, baseURL }) => {
  // 1. Log in via the UI so subsequent fetches share the session cookie
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@dhl.com");
  await page.locator('input[type="password"]').fill("admin123");
  await page.getByRole("button", { name: /sign in/i }).click();
  // NextAuth signIn() returns asynchronously and then router.push("/") fires.
  // Wait for the redirect away from /login.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  // Confirm the session cookie actually got set before issuing API calls.
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.some((c) => c.name.includes("next-auth.session-token"));
    }, { timeout: 10_000 })
    .toBe(true);

  // 2. Ingest a unique text snippet (timestamp avoids the 14-day duplicate guard)
  const unique = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ingestBody = {
    type: "note",
    content: `Test SOP ${unique}: 1. Open the scanner app. 2. Aim at the barcode. 3. Confirm the beep. 4. Place the parcel on the conveyor.`,
  };
  const ingestRes = await page.request.post("/api/ingest", { data: ingestBody });
  expect(ingestRes.status(), await ingestRes.text()).toBe(200);
  const ingestJson = await ingestRes.json();
  expect(ingestJson.id).toBeTruthy();
  expect(ingestJson.isDuplicate).toBe(false);

  // 3. Process it into an article
  const processRes = await page.request.post("/api/process", {
    data: { rawInputId: ingestJson.id },
  });
  expect(processRes.status(), await processRes.text()).toBe(200);
  const processJson = await processRes.json();
  const article = processJson.article ?? processJson;

  // 4. Native-array assertions — these would fail under the old
  //    JSON-stringified SQLite schema.
  expect(Array.isArray(article.tags), `tags should be array, got ${typeof article.tags}`).toBe(true);
  expect(Array.isArray(article.steps)).toBe(true);
  expect(Array.isArray(article.relatedLinks)).toBe(true);
  expect(article.tags.length).toBeGreaterThan(0);
  expect(article.steps.length).toBeGreaterThan(0);
  expect(typeof article.title).toBe("string");
  expect(article.status).toBe("draft");

  // 5. Round-trip: GET the article back and confirm the same shape
  const getRes = await page.request.get(`/api/articles/${article.id}`);
  expect(getRes.status()).toBe(200);
  const fetched = await getRes.json();
  expect(Array.isArray(fetched.tags)).toBe(true);
  expect(fetched.tags).toEqual(article.tags);

  void baseURL;
});
