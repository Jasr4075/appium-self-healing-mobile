import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockDriver } from "./helpers/mock-driver.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sh-index-"));

process.env.HEALING_LOG_DIR = path.join(tmpDir, "logs");
process.env.HEALING_HISTORY_PATH = path.join(tmpDir, "history.json");

const selfHealing = await import("../src/index.js");

const ORIGINAL = 'android=new UiSelector().className("android.widget.Button").text("Entrar")';

function makeDriver(options = {}) {
  return new MockDriver(options);
}

test("index: default export expõe módulos e helpers", () => {
  assert.equal(typeof selfHealing.default.initialize, "function");
  assert.equal(typeof selfHealing.default.find, "function");
  assert.equal(typeof selfHealing.default.healingFind, "function");
  assert.equal(typeof selfHealing.default.healingClick, "function");
  assert.equal(typeof selfHealing.default.healingSetText, "function");
  assert.equal(typeof selfHealing.default.healingGetText, "function");
  assert.equal(typeof selfHealing.default.getStats, "function");
  assert.equal(typeof selfHealing.default.exportReport, "function");
  assert.equal(typeof selfHealing.default.cleanup, "function");
  assert.ok(selfHealing.default.healingEngine);
  assert.ok(selfHealing.default.selectorAnalyzer);
  assert.ok(selfHealing.default.similarityScore);
  assert.ok(selfHealing.default.selectorHistory);
  assert.ok(selfHealing.default.healingLogger);
});

test("index: named exports expõem módulos e helpers", () => {
  assert.ok(selfHealing.healingEngine);
  assert.ok(selfHealing.selectorAnalyzer);
  assert.ok(selfHealing.similarityScore);
  assert.ok(selfHealing.selectorHistory);
  assert.ok(selfHealing.healingLogger);
  assert.equal(typeof selfHealing.initialize, "function");
  assert.equal(typeof selfHealing.find, "function");
  assert.equal(typeof selfHealing.healingFind, "function");
  assert.equal(typeof selfHealing.healingClick, "function");
  assert.equal(typeof selfHealing.healingSetText, "function");
  assert.equal(typeof selfHealing.healingGetText, "function");
});

test("index: initialize configura engine sem options.enabled", () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  selfHealing.initialize(driver, "spec-init");
  assert.equal(selfHealing.healingEngine.driver, driver);
  assert.equal(selfHealing.healingEngine.currentSpec, "spec-init");
  assert.equal(selfHealing.healingEngine.enabled, true);
});

test("index: initialize respeita options.enabled=false", () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  selfHealing.initialize(driver, "spec-init", { enabled: false });
  assert.equal(selfHealing.healingEngine.enabled, false);
});

test("index: initialize respeita options.enabled=true", () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  selfHealing.initialize(driver, "spec-init", { enabled: true });
  assert.equal(selfHealing.healingEngine.enabled, true);
});

test("index: find configura driver padrão quando não configurado", async () => {
  selfHealing.healingEngine.driver = null;
  const driver = makeDriver({ existing: [ORIGINAL] });

  const element = await selfHealing.find(driver, ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.equal(selfHealing.healingEngine.driver, driver);
  assert.equal(selfHealing.healingEngine.currentSpec, "default");
});

test("index: find reutiliza engine já configurado", async () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  selfHealing.healingEngine.configure(driver, "spec-pre");

  const element = await selfHealing.find(driver, ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.equal(selfHealing.healingEngine.currentSpec, "spec-pre");
});

test("index: atalhos healingFind/healingClick/healingSetText/healingGetText", async () => {
  const driver = makeDriver({
    existing: [ORIGINAL],
    texts: { [ORIGINAL]: "Saldo" },
  });
  selfHealing.healingEngine.configure(driver, "spec-shortcuts");
  selfHealing.healingEngine.setEnabled(true);

  const found = await selfHealing.healingFind(ORIGINAL);
  assert.equal(await found.isExisting(), true);

  await selfHealing.healingClick(ORIGINAL);
  assert.equal(driver.elements.at(-1).clicked, true);

  await selfHealing.healingSetText(ORIGINAL, "abc");
  assert.deepEqual(driver.elements.at(-1).values, ["abc"]);

  const text = await selfHealing.healingGetText(ORIGINAL);
  assert.equal(text, "Saldo");
});

test("index: atalhos named export healingSetText e healingGetText", async () => {
  const driver = makeDriver({
    existing: [ORIGINAL],
    texts: { [ORIGINAL]: "Outro" },
  });
  selfHealing.healingEngine.configure(driver, "spec-named");
  selfHealing.healingEngine.setEnabled(true);

  await selfHealing.healingClick(ORIGINAL);
  await selfHealing.healingSetText(ORIGINAL, "xyz");
  assert.deepEqual(driver.elements.at(-1).values, ["xyz"]);

  const text = await selfHealing.healingGetText(ORIGINAL);
  assert.equal(text, "Outro");
});

test("index: atalhos do default export healingFind/healingClick/healingSetText/healingGetText", async () => {
  const driver = makeDriver({
    existing: [ORIGINAL],
    texts: { [ORIGINAL]: "Padrão" },
  });
  selfHealing.healingEngine.configure(driver, "spec-default-shortcuts");
  selfHealing.healingEngine.setEnabled(true);

  const found = await selfHealing.default.healingFind(ORIGINAL, {});
  assert.equal(await found.isExisting(), true);

  await selfHealing.default.healingClick(ORIGINAL, {});
  assert.equal(driver.elements.at(-1).clicked, true);

  await selfHealing.default.healingSetText(ORIGINAL, "zxy", {});
  assert.deepEqual(driver.elements.at(-1).values, ["zxy"]);

  const text = await selfHealing.default.healingGetText(ORIGINAL, {});
  assert.equal(text, "Padrão");
});

test("index: getStats, exportReport e cleanup funcionam", () => {
  const stats = selfHealing.default.getStats();
  assert.ok(stats.history.totalEntries >= 0);

  const outputPath = path.join(tmpDir, "index-report.json");
  selfHealing.default.exportReport(outputPath);
  assert.equal(fs.existsSync(outputPath), true);

  selfHealing.default.cleanup(0);
  assert.ok(selfHealing.default.getStats().history.totalEntries >= 0);
});

test("index: default export referencea os mesmos singletons", () => {
  assert.equal(selfHealing.default.healingEngine, selfHealing.healingEngine);
  assert.equal(selfHealing.default.selectorAnalyzer, selfHealing.selectorAnalyzer);
  assert.equal(selfHealing.default.similarityScore, selfHealing.similarityScore);
  assert.equal(selfHealing.default.selectorHistory, selfHealing.selectorHistory);
  assert.equal(selfHealing.default.healingLogger, selfHealing.healingLogger);
});