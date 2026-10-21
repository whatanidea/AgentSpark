import { existsSync, unlinkSync } from "node:fs";
import { basename } from "node:path";

export default function cleanup() {
  const path = process.env.AGENTSPARK_E2E_ARCHIVE;
  if (!path || !basename(path).startsWith("agentspark-e2e-")) throw new Error("Missing isolated browser archive path.");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    if (existsSync(path + suffix)) unlinkSync(path + suffix);
  }
}
