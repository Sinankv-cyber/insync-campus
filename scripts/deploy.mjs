// One-shot Vercel production deploy. Requires `npx vercel login` first (done by a human).
// Copies env values from .env.local into Vercel via stdin (never printed), deploys, then
// sets APP_URL to the real production URL and redeploys so QR links and Google OAuth match.
// Usage: node scripts/deploy.mjs [--scope sibaq-nexus] [--project hostelpass]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SCOPE = arg("--scope", "sibaq-nexus");
const PROJECT = arg("--project", "insync");
const isWin = process.platform === "win32";

function vercel(args, input) {
  const r = spawnSync(isWin ? "npx.cmd" : "npx", ["--yes", "vercel@latest", ...args, "--scope", SCOPE], { input, encoding: "utf8", shell: isWin });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));

const who = vercel(["whoami"]);
if (who.code !== 0) { console.error("Not signed in to Vercel. Run: npx vercel login"); process.exit(1); }
console.log("[deploy] signed in");

let r = vercel(["link", "--yes", "--project", PROJECT]);
console.log("[deploy] link:", r.code === 0 ? "ok" : r.out.slice(-300));

const KEYS = ["DATABASE_URL", "AUTH_SECRET", "CRON_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
function setEnv(key, value) {
  vercel(["env", "rm", key, "production", "--yes"]);
  const s = vercel(["env", "add", key, "production"], value);
  console.log(`[deploy] env ${key}: ${s.code === 0 ? "set" : "FAILED " + s.out.slice(-200)}`);
}
setEnv("STORAGE_DRIVER", "neon");
for (const k of KEYS) if (env[k]) setEnv(k, env[k]);

function deploy() {
  const d = vercel(["deploy", "--prod", "--yes"]);
  const urls = [...d.out.matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app/g)].map((m) => m[0]);
  if (d.code !== 0) { console.error("[deploy] FAILED\n" + d.out.slice(-2500)); process.exit(1); }
  return urls;
}
let urls = deploy();
const alias = urls.find((u) => !/-[a-z0-9]{9}-/.test(u)) || urls[urls.length - 1];
console.log("[deploy] first deploy ok:", alias);
setEnv("APP_URL", alias);
urls = deploy();
console.log("[deploy] PRODUCTION URL:", alias);
