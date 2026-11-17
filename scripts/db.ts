// Usage: npm run db:migrate | npm run db:seed   (loads .env.local; driver is chosen explicitly by STORAGE_DRIVER)
import { runMigrations } from "../src/lib/migrations";
import { seed } from "../src/lib/seed";
import { getDb } from "../src/lib/db";

async function main() {
  const cmd = process.argv[2];
  const driver = getDb().driver;
  console.log(`[db] driver=${driver}`);
  if (cmd === "migrate") console.log("[db] applied:", await runMigrations());
  else if (cmd === "seed") console.log("[db]", await seed());
  else if (cmd === "check") {
    const r = await getDb().all(`SELECT role, COUNT(*) AS n FROM users GROUP BY role ORDER BY role`);
    console.log("[db] users by role:", r);
  } else if (cmd === "rebrand") {
    // One-off: move seeded demo accounts from @hostelpass.test to @insync.test and the new demo password.
    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("InSync@2026", 10);
    const db = getDb();
    const rows = await db.all<{ id: string; email: string }>(`SELECT id, email FROM users WHERE is_demo = 1 AND email LIKE '%@hostelpass.test'`);
    await db.tx(async (tx) => { for (const r of rows) await tx.run(`UPDATE users SET email = $2, password_hash = $3 WHERE id = $1`, [r.id, r.email.replace("@hostelpass.test", "@insync.test"), hash]); });
    await db.run(`UPDATE hostels SET name = $1 WHERE id = 'h_periyar'`, ["Periyar Hostel"]);
    console.log("[db] demo accounts renamed:", rows.length);
  } else throw new Error("unknown command");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
