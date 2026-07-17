/* Stage 4 end-to-end smoke, driven with Playwright against the live stack.
 * Run from frontend/:  node e2e/smoke.mjs
 * Artifacts (screenshots) land in e2e/artifacts/. */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = new URL("./artifacts/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- helpers --
const env = Object.fromEntries(
  readFileSync(`${ROOT}/.env`, "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

function curl(args) {
  return execFileSync(
    "curl",
    ["-sk", "--resolve", "orbit.localhost:443:127.0.0.1", ...args],
    { encoding: "utf8" },
  );
}

function apiJson(method, path, token, body) {
  const args = ["-X", method, `https://orbit.localhost/api/v1${path}`];
  if (token) args.push("-H", `Authorization: Bearer ${token}`);
  if (body) args.push("-H", "Content-Type: application/json", "-d", JSON.stringify(body));
  const out = curl(args);
  return out ? JSON.parse(out) : null;
}

function mqttPub(user, pass, topic, message, retain = false) {
  execFileSync("docker", [
    "compose", "exec", "-T", "mosquitto", "mosquitto_pub",
    "-u", user, "-P", pass, "-i", user,
    "-t", topic, "-m", message, "-q", "1", ...(retain ? ["-r"] : []),
  ], { cwd: ROOT });
}

let failures = 0;
function check(label, condition) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures += 1;
}

// ----------------------------------------------------------------- set-up --
const admin = apiJson("POST", "/auth/login", null, {
  email: env.ORBIT_ADMIN_EMAIL,
  password: env.ORBIT_ADMIN_PASSWORD,
});
const token = admin.access_token;

// Real sensor device credentials (from the firmware config, gitignored).
const firmwareConfig = readFileSync(
  `${ROOT}/firmware/orbit_esp32_dht11/orbit_config.h`,
  "utf8",
);
const sensorId = firmwareConfig.match(/DEVICE_ID\s+"([^"]+)"/)[1];
const sensorUser = firmwareConfig.match(/MQTT_USERNAME\s+"([^"]+)"/)[1];
const sensorPass = firmwareConfig.match(/MQTT_PASSWORD\s+"([^"]+)"/)[1];

// Virtual switch for the toggle/optimistic path (normal registration API).
const rooms = apiJson("GET", "/rooms", token);
const livingRoom = rooms.data.find((room) => room.slug === "living-room");
let virtual = apiJson("GET", "/devices", token).data.find(
  (device) => device.name === "Virtual Test Switch",
);
let virtualCreds;
if (!virtual) {
  const created = apiJson("POST", "/devices", token, {
    name: "Virtual Test Switch",
    type: "virtual-switch",
    room_id: livingRoom?.id,
    capabilities: [
      { capability: "power", data_type: "bool", access: "read_write", label: "Power", config: {} },
    ],
  });
  virtual = created;
  virtualCreds = created.mqtt_credentials;
  console.log("created Virtual Test Switch", virtual.id);
} else {
  console.log("Virtual Test Switch exists", virtual.id);
}

// Test scene (idempotent).
let scene = apiJson("GET", "/scenes", token).data.find((s) => s.slug === "evening-test");
if (!scene) {
  scene = apiJson("POST", "/scenes", token, {
    name: "Evening Test",
    description: "Smoke-test scene",
    actions: [
      { device_id: virtual.id, capability: "power", payload: { value: true } },
    ],
  });
  // API slugifies the name; refetch to be sure.
  scene = apiJson("GET", "/scenes", token).data.find((s) => s.name === "Evening Test");
}

// Devices online (retained availability) + a seeded sensor value.
if (virtualCreds) {
  mqttPub(virtualCreds.username, virtualCreds.password, `orbit/devices/${virtual.id}/availability`, "online", true);
}
mqttPub(sensorUser, sensorPass, `orbit/devices/${sensorId}/availability`, "online", true);
mqttPub(sensorUser, sensorPass, `orbit/devices/${sensorId}/temperature/state`, '{"value": 23.7}', true);

// ---------------------------------------------------------------- browser --
const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
await page.context().setDefaultNavigationTimeout?.(30000);

// 1. Login flow.
await page.goto("https://orbit.localhost/login");
await page.fill("#email", env.ORBIT_ADMIN_EMAIL);
await page.fill("#password", env.ORBIT_ADMIN_PASSWORD);
await page.click("button[type=submit]");
await page.waitForURL("https://orbit.localhost/");
check("login → dashboard", page.url() === "https://orbit.localhost/");

// 2. Dashboard renders tiles (auto-seed or persisted layout).
await page.waitForSelector("text=Temperature", { timeout: 20000 });
check("sensor tile present", await page.isVisible("text=Temperature"));
await page.screenshot({ path: `${OUT}dashboard-dark.png`, fullPage: true });

// 3. Live MQTT → WS push into the sensor tile.
mqttPub(sensorUser, sensorPass, `orbit/devices/${sensorId}/temperature/state`, '{"value": 26.4}');
await page.waitForSelector("text=26.4", { timeout: 10000 }).catch(() => {});
check("live WS value update (26.4)", await page.isVisible("text=26.4"));

// 4. Toggle: optimistic flip, then device echo → reconciliation.
const vcredsUser = virtualCreds?.username ?? null;
const toggle = page.locator(`button[role=switch][aria-label=Power]`).first();
await toggle.waitFor({ timeout: 10000 });
const before = await toggle.getAttribute("data-state");
await toggle.click();
const optimistic = await toggle.getAttribute("data-state");
check("optimistic flip is instant", optimistic !== before);
// Echo confirmed state as the device would.
if (vcredsUser) {
  const next = optimistic === "checked" ? 1 : 0;
  mqttPub(virtualCreds.username, virtualCreds.password,
    `orbit/devices/${virtual.id}/power/state`, JSON.stringify({ value: next === 1 }), true);
}
await page.waitForTimeout(1500);
check("state reconciled (no rollback)", (await toggle.getAttribute("data-state")) === optimistic);

// 5. Offline rejection → rollback affordance.
if (vcredsUser) {
  mqttPub(virtualCreds.username, virtualCreds.password, `orbit/devices/${virtual.id}/availability`, "offline", true);
  await page.waitForTimeout(1200);
  const disabled = await toggle.isDisabled();
  check("offline device disables toggle", disabled);
  mqttPub(virtualCreds.username, virtualCreds.password, `orbit/devices/${virtual.id}/availability`, "online", true);
  await page.waitForTimeout(800);
}

// 6. Command palette: navigate + scene run.
await page.keyboard.press("ControlOrMeta+KeyK");
await page.waitForSelector("[cmdk-input]");
await page.fill("[cmdk-input]", "bedroom");
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await page.waitForURL("**/rooms/bedroom");
check("palette navigates to Bedroom", page.url().endsWith("/rooms/bedroom"));
await page.screenshot({ path: `${OUT}room-bedroom.png`, fullPage: true });

await page.keyboard.press("ControlOrMeta+KeyK");
await page.fill("[cmdk-input]", "Evening Test");
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
const paletteFeedback = await page.textContent("[cmdk-list]").catch(() => "");
check("palette scene run feedback", /sent|offline|Running/.test(paletteFeedback ?? ""));
await page.keyboard.press("Escape");

// 7. Themes: switch via settings, screenshot each.
await page.goto("https://orbit.localhost/settings");
for (const theme of ["light", "midnight", "glass"]) {
  await page.click(`button:has-text("${theme}")`);
  await page.waitForTimeout(350);
  const applied = await page.evaluate(() => document.documentElement.dataset.theme);
  check(`theme applied: ${theme}`, applied === theme);
  await page.goto("https://orbit.localhost/");
  await page.waitForSelector("text=Temperature");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}dashboard-${theme}.png`, fullPage: true });
  await page.goto("https://orbit.localhost/settings");
}
await page.click(`button:has-text("dark")`);

// 8. Layout persistence across reload.
await page.goto("https://orbit.localhost/");
await page.waitForSelector("text=Temperature");
const tileCount = await page.locator("main .material").count();
await page.reload();
await page.waitForSelector("text=Temperature");
const tileCountAfter = await page.locator("main .material").count();
check("layout persists across reload", tileCount === tileCountAfter && tileCount > 0);

// 9. Audit page shows this session's writes with actor chips.
await page.goto("https://orbit.localhost/audit");
await page.waitForSelector("text=device.capability.write", { timeout: 10000 });
check("audit shows capability writes", await page.isVisible("text=device.capability.write"));
check("audit shows user actor chip", (await page.locator("text=User").count()) > 0);

// 10. Mobile viewport sanity.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("https://orbit.localhost/");
await page.waitForSelector("text=Temperature");
await page.screenshot({ path: `${OUT}dashboard-mobile.png`, fullPage: true });
check("mobile renders dashboard", await page.isVisible("text=Temperature"));

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
