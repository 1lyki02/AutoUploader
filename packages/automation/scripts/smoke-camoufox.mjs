import { Camoufox } from "camoufox-js";

const browser = await Camoufox({
  headless: true,
  os: "windows",
  exclude_addons: ["UBO"],
});
console.log("launched");
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();
await page.goto("https://example.com", { timeout: 60_000 });
console.log("title", await page.title());
await context.close();
await browser.close();
console.log("ok");
