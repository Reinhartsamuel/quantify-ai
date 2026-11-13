import { mkdirSync, writeFileSync } from "node:fs";

const directory = new URL("../docs/evidence/", import.meta.url);

export function writeEvidence(name: string, value: unknown): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL(name, directory), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`Wrote docs/evidence/${name}`);
}
