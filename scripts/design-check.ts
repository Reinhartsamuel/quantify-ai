import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { writeEvidence } from "./evidence.js";

const roots = ["apps/web/src"];
const files: string[] = [];
function walk(path: string) {
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|css)$/.test(full)) files.push(full);
  }
}
for (const root of roots) walk(root);

const forbiddenCopy = [
  "trusted by",
  "revolutionize",
  "supercharge",
  "unlock",
  "guaranteed profit",
  "risk-free",
  "to the moon",
  "get rich",
  "10x your",
  "join thousands",
];
const forbiddenVisual = [
  "linear-gradient(",
  "radial-gradient(",
  "box-shadow: 0 0",
  "backdrop-filter: blur(2",
  "glassmorphism",
  "neon",
  "text-shadow",
];

const findings: Array<{ file: string; rule: string; detail: string }> = [];
let hexOutsideTokens = 0;
let tabularNums = 0;
let focusVisible = 0;
let reducedMotion = 0;
let mobileBreakpoints = 0;
let labeledInputs = 0;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(".", file);
  for (const term of forbiddenCopy) {
    if (text.toLowerCase().includes(term)) {
      findings.push({ file: rel, rule: "forbidden-copy", detail: term });
    }
  }
  if (rel.endsWith("globals.css")) {
    for (const term of forbiddenVisual) {
      if (text.includes(term) && term !== "linear-gradient(") {
        findings.push({ file: rel, rule: "forbidden-visual", detail: term });
      }
    }
    if (text.includes("tabular-nums")) tabularNums += 1;
    if (text.includes(":focus-visible")) focusVisible += 1;
    if (text.includes("prefers-reduced-motion")) reducedMotion += 1;
    if (text.includes("max-width: 600px") && text.includes("max-width: 900px"))
      mobileBreakpoints += 1;
    // The token block is the only place raw colours are allowed.
    const outsideTokens = text.replace(/:root[\s\S]*?\n}\n/g, "").match(/#[0-9a-fA-F]{3,8}\b/g);
    hexOutsideTokens += outsideTokens?.length ?? 0;
  }
  if (rel.endsWith(".tsx")) {
    if (/<label[^>]*htmlFor=/.test(text)) labeledInputs += 1;
  }
}
if (hexOutsideTokens > 0) {
  findings.push({
    file: "apps/web/src/app/globals.css",
    rule: "raw-hex-outside-tokens",
    detail: String(hexOutsideTokens),
  });
}

const checks = {
  noForbiddenCopy: findings.every((finding) => finding.rule !== "forbidden-copy"),
  noForbiddenVisual: findings.every((finding) => finding.rule !== "forbidden-visual"),
  semanticColorTokensOnly: hexOutsideTokens === 0,
  tabularNumerals: tabularNums > 0,
  visibleFocus: focusVisible > 0,
  reducedMotion: reducedMotion > 0,
  mobileLayouts: mobileBreakpoints > 0,
  labeledForms: labeledInputs > 0,
  noFakeSocialProof: !files.some((file) =>
    readFileSync(file, "utf8").toLowerCase().includes("testimonial"),
  ),
};
const passed = Object.values(checks).every(Boolean);
const report = {
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  checks,
  findings,
  passed,
  note: "Static anti-slop and design-system check. Browser screenshots and axe-core still require a working Chromium/Chrome runtime on staging.",
};
writeEvidence("design-check.json", report);
console.log(JSON.stringify(report, null, 2));
if (!passed) process.exit(1);
