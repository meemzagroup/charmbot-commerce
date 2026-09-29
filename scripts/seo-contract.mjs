import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const privateRobots = '{ name: "robots", content: "noindex, nofollow" }';

for (const path of [
  "src/routes/_authenticated/route.tsx",
  "src/routes/auth.tsx",
  "src/routes/reset-password.tsx",
]) {
  assert.ok(read(path).includes(privateRobots), `${path} must emit noindex, nofollow`);
}

const sitemap = read("public/sitemap.xml");
assert.ok(!sitemap.includes("crm.manutaaccounting.online/</loc>"), "private dashboard must not be in sitemap");

const robots = read("public/robots.txt");
assert.ok(robots.includes("Disallow: /"), "app-only CRM must block crawler access by default");

console.log("SEO privacy contract passed");
