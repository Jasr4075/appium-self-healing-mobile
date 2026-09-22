/**
 * Gera coverage/badge.json a partir do resumo do c8 (coverage/coverage-summary.json).
 * Usado pelo GitHub Actions para atualizar o badge de cobertura no README.
 */

import fs from "node:fs";

const summaryPath = "coverage/coverage-summary.json";
const badgePath = "coverage/badge.json";

if (!fs.existsSync(summaryPath)) {
  console.error(`Arquivo não encontrado: ${summaryPath}. Rode "npm run test:coverage" antes.`);
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const totals = summary.total || {};
const pct = totals.lines?.pct ?? 0;
const value = `${pct.toFixed(0)}%`;

const color =
  pct >= 80 ? "brightgreen" :
  pct >= 70 ? "green" :
  pct >= 60 ? "yellowgreen" :
  pct >= 50 ? "yellow" :
  pct >= 30 ? "orange" : "red";

const badge = {
  schemaVersion: 1,
  label: "coverage",
  message: value,
  color,
};

fs.writeFileSync(badgePath, JSON.stringify(badge, null, 2) + "\n", "utf8");
console.log(`Badge de cobertura atualizado: ${value} (${color})`);