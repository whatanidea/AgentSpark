import { existsSync, unlinkSync } from "node:fs";
import { basename } from "node:path";

export default function cleanup() {
  const path = process.env.AGENTSPARK_E2E_ARCHIVE;
  if (!path || !basename(path).startsWith("agentspark-e2e-")) throw new Error("Missing isolated browser archive path.");
  for (const database of [path, path.replace(/\.sqlite3$/, ".tenants.sqlite3")]) {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      if (existsSync(database + suffix)) unlinkSync(database + suffix);
    }
  }
}
