import { rmSync } from "node:fs";

for (const path of ["dist", ".firebase", ".preview", "coverage"]) {
  rmSync(path, { recursive: true, force: true });
}

console.log("Artefatos locais removidos.");
