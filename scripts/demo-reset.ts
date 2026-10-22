/**
 * Deletes the local demo database and uploads. The next request (or `npm run demo:seed`)
 * recreates and reseeds it. Only touches .data/demo (or HOMECARE_DEMO_DATA_DIR).
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), process.env.HOMECARE_DEMO_DATA_DIR || ".data/demo");
if (!dir.startsWith(path.resolve(process.cwd(), ".data"))) {
  console.error(`Refusing to delete ${dir}: demo data must live under .data/`);
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Stop and restart the dev server so it reopens a fresh demo database.`);
