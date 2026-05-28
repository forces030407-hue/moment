import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(artifactDir, "dist", "public");

const staticEntries = [
  "index.html",
  "admin.html",
  "customer.html",
  "favicon.svg",
  "public",
  "data",
];

await rm(path.join(artifactDir, "dist"), { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

for (const entry of staticEntries) {
  await cp(path.join(artifactDir, entry), path.join(publicDir, entry), {
    recursive: true,
    force: true,
  });
}
