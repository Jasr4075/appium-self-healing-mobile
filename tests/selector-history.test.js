import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sh-history-"));
const historyFile = path.join(tmpDir, "history.json");

process.env.HEALING_LOG_DIR = path.join(tmpDir, "logs");
process.env.HEALING_HISTORY_PATH = historyFile;

const { default: selectorHistory } = await import("../src/selector-history.js");

function reset(file = historyFile) {
  selectorHistory.history = null;
  selectorHistory.cache.clear();
  selectorHistory.historyFile = file;
}

function addEntry(overrides = {}) {
  selectorHistory.add({
    originalSelector: "original-x",
    newSelector: "new-x",
    score: 0.8,
    reasons: ["class-exact"],
    spec: "spec-a",
    success: true,
    ...overrides,
  });
}

test("selectorHistory: ensureDirectory cria diretório ausente", () => {
  const nested = path.join(tmpDir, "aninhado", "extra", "history.json");
  if (fs.existsSync(path.join(tmpDir, "aninhado"))) {
    fs.rmSync(path.join(tmpDir, "aninhado"), { recursive: true, force: true });
  }
  reset(nested);

  selectorHistory.loadHistory();
  assert.equal(fs.existsSync(path.join(tmpDir, "aninhado", "extra")), true);
});

test("selectorHistory: loadHistory retorna [] quando o arquivo não existe", () => {
  reset();
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

  const history = selectorHistory.loadHistory();
  assert.deepEqual(history, []);
});

test("selectorHistory: loadHistory trata JSON corrompido", () => {
  reset();
  fs.writeFileSync(historyFile, "não é json {", "utf8");

  const history = selectorHistory.loadHistory();
  assert.deepEqual(history, []);
});

test("selectorHistory: loadHistory trata JSON 'null' como lista vazia", () => {
  const altFile = path.join(tmpDir, "null-history.json");
  fs.writeFileSync(altFile, "null", "utf8");
  reset(altFile);

  const history = selectorHistory.loadHistory();
  assert.deepEqual(history, []);
});

test("selectorHistory: add persiste entrada e atualiza cache", () => {
  reset();
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

  addEntry();

  const added = selectorHistory.find("original-x", "spec-a");
  assert.equal(added.newSelector, "new-x");
  assert.equal(added.score, 0.8);
  assert.deepEqual(added.reasons, ["class-exact"]);
  assert.equal(added.success, true);

  const persisted = JSON.parse(fs.readFileSync(selectorHistory.historyFile, "utf8"));
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].originalSelector, "original-x");
});

test("selectorHistory: add usa context padrão vazio e sucesso padrão", () => {
  reset();
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

  addEntry({ context: { page: "login" } });
  const withContext = selectorHistory.find("original-x", "spec-a");
  assert.deepEqual(withContext.context, { page: "login" });

  addEntry({ originalSelector: "original-y", spec: "spec-a", success: false });
  const withDefault = selectorHistory.find("original-y", "spec-a");
  assert.deepEqual(withDefault.context, {});
  assert.equal(withDefault.success, true);
});

test("selectorHistory: find retorna null quando não há match", () => {
  assert.equal(selectorHistory.find("não-existe", "spec-z"), null);
});

test("selectorHistory: generateKey cria chave única spec::selector", () => {
  assert.equal(selectorHistory.generateKey("sel", "spec"), "spec::sel");
});

test("selectorHistory: findBySpec e findByOriginalSelector filtram corretamente", () => {
  const bySpec = selectorHistory.findBySpec("spec-a");
  assert.ok(bySpec.every((e) => e.spec === "spec-a"));

  const bySelector = selectorHistory.findByOriginalSelector("original-x");
  assert.ok(bySelector.every((e) => e.originalSelector === "original-x"));
  assert.equal(bySelector.length >= 1, true);
});

test("selectorHistory: hasEntry indica presença no histórico", () => {
  assert.equal(selectorHistory.hasEntry("original-x", "spec-a"), true);
  assert.equal(selectorHistory.hasEntry("nada", "spec-a"), false);
});

test("selectorHistory: getStats calcula métricas com histórico", () => {
  const stats = selectorHistory.getStats();

  assert.equal(stats.totalEntries >= 2, true);
  assert.ok(stats.successRate.endsWith("%"));
  assert.equal(stats.uniqueSpecs >= 1, true);
  assert.equal(stats.uniqueSelectors >= 1, true);
  assert.equal(typeof stats.averageScore, "string");
  assert.equal(Array.isArray(stats.mostProblematic), true);
});

test("selectorHistory: getStats retorna zeros com histórico vazio", () => {
  reset();
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

  const stats = selectorHistory.getStats();
  assert.equal(stats.totalEntries, 0);
  assert.equal(stats.successRate, "0%");
  assert.equal(stats.averageScore, "0.00");
  assert.deepEqual(stats.mostProblematic, []);
});

test("selectorHistory: cleanup remove entradas antigas e mantém recentes", () => {
  reset();
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

  const history = selectorHistory.loadHistory();
  history.push({
    originalSelector: "antigo",
    newSelector: "n-antigo",
    score: 0.4,
    reasons: [],
    spec: "sp",
    timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    success: false,
    context: {},
  });
  history.push({
    originalSelector: "recente",
    newSelector: "n-recente",
    score: 0.9,
    reasons: [],
    spec: "sp",
    timestamp: new Date().toISOString(),
    success: true,
    context: {},
  });
  selectorHistory.buildCache();
  selectorHistory.saveHistory();

  selectorHistory.cleanup(7);

  const remaining = selectorHistory.loadHistory();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].originalSelector, "recente");
});

test("selectorHistory: cleanup não faz nada quando nada foi removido", () => {
  selectorHistory.cleanup(3000);
  const remaining = selectorHistory.loadHistory();
  assert.equal(remaining.length, 1);
});

test("selectorHistory: export grava relatório com estatísticas e entradas", () => {
  const outputPath = path.join(tmpDir, "report.json");
  selectorHistory.export(outputPath);

  const report = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.ok(report.generatedAt);
  assert.ok(report.statistics.totalEntries >= 0);
  assert.equal(Array.isArray(report.entries), true);
});

test("selectorHistory: export captura erro de escrita", () => {
  const outputPath = path.join(tmpDir, "ausente", "sub", "report.json");
  selectorHistory.export(outputPath);
  assert.equal(fs.existsSync(outputPath), false);
});

test("selectorHistory: saveHistory captura erro ao escrever em diretório", () => {
  reset(historyFile);
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);
  const dirAsFile = path.join(tmpDir, "dir-history.json");
  fs.mkdirSync(dirAsFile, { recursive: true });

  selectorHistory.historyFile = dirAsFile;
  selectorHistory.history = null;
  selectorHistory.cache.clear();

  selectorHistory.add({
    originalSelector: "s",
    newSelector: "n",
    score: 0.5,
    reasons: [],
    spec: "sp",
  });
});

test("selectorHistory: clear limpa histórico e cache", () => {
  reset();
  if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);

  addEntry();
  selectorHistory.clear();

  assert.equal(selectorHistory.loadHistory().length, 0);
  assert.equal(selectorHistory.find("original-x", "spec-a"), null);
  assert.deepEqual(JSON.parse(fs.readFileSync(historyFile, "utf8")), []);
});