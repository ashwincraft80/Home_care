/** Creates (if needed) and seeds the embedded demo database without starting the web server. */
import fs from "node:fs";
import path from "node:path";
import { createPgliteDatabase } from "../lib/database/pglite";
import { isSeeded, seedDemoData } from "../lib/database/seed";

const dir = path.resolve(process.cwd(), process.env.HOMECARE_DEMO_DATA_DIR || ".data/demo");
fs.mkdirSync(dir, { recursive: true });
const db = await createPgliteDatabase(path.join(dir, "pglite"));
if (await isSeeded(db)) {
  console.log("Demo database already seeded. Run `npm run demo:reset` first to start over.");
} else {
  await seedDemoData(db);
  console.log(`Seeded demo database at ${dir}`);
}
await db.close();
