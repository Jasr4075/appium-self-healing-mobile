import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockDriver } from "./helpers/mock-driver.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sh-engine-"));

process.env.HEALING_LOG_DIR = path.join(tmpDir, "logs");
process.env.HEALING_HISTORY_PATH = path.join(tmpDir, "history.json");

const { default: healingEngine } = await import("../src/healing-engine.js");
const { default: selectorHistory } = await import("../src/selector-history.js");

const ORIGINAL = 'android=new UiSelector().className("android.widget.Button").text("Entrar")';
const HEALED_ID = 'android=new UiSelector().resourceId("com.app:id/btn_ok").instance(0)';
const XML_ID_BUTTON =
  '<hierarchy rotation="0">' +
  '<android.widget.Button resource-id="com.app:id/btn_ok" text="Entrar" content-desc="" ' +
  'clickable="true" enabled="true" bounds="[0,50][200,100]"/>' +
  "</hierarchy>";
const XML_TEXT_BUTTON =
  '<hierarchy rotation="0">' +
  '<android.widget.Button resource-id="" text="Entrar" content-desc="" ' +
  'clickable="true" enabled="true" bounds="[0,50][200,100]"/>' +
  "</hierarchy>";
const TEXT_SELECTOR = 'android=new UiSelector().text("Entrar").instance(0)';

function makeDriver(options = {}) {
  return new MockDriver(options);
}

test("healingEngine: configure define driver e spec", () => {
  const driver = makeDriver();
  healingEngine.configure(driver, "spec-configure");
  assert.equal(healingEngine.driver, driver);
  assert.equal(healingEngine.currentSpec, "spec-configure");
});

test("healingEngine: setEnabled alterna estado", () => {
  healingEngine.setEnabled(false);
  assert.equal(healingEngine.enabled, false);
  healingEngine.setEnabled(true);
  assert.equal(healingEngine.enabled, true);
});

test("healingEngine: healingFind retorna elemento encontrado diretamente", async () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  healingEngine.configure(driver, "spec-direct");

  const element = await healingEngine.healingFind(ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.equal(driver.created[0], ORIGINAL);
});

test("healingEngine: healingFind lança erro sem driver configurado", async () => {
  healingEngine.driver = null;
  await assert.rejects(healingEngine.healingFind(ORIGINAL), /não foi configurado/);
});

test("healingEngine: healingFind lança quando desabilitado e elemento não existe", async () => {
  const driver = makeDriver({ existing: [] });
  healingEngine.configure(driver, "spec-disabled");
  healingEngine.setEnabled(false);

  await assert.rejects(
    healingEngine.healingFind('android=new UiSelector().text("SemBotao").instance(0)'),
    /Elemento não encontrado/,
  );
  healingEngine.setEnabled(true);
});

test("healingEngine: healingFind relança erro externo quando desabilitado", async () => {
  const boom = new Error("boom externo");
  const driver = makeDriver({ errors: { [ORIGINAL]: boom } });
  healingEngine.configure(driver, "spec-disabled-2");
  healingEngine.setEnabled(false);

  await assert.rejects(healingEngine.healingFind(ORIGINAL), /boom externo/);
  healingEngine.setEnabled(true);
});

test("healingEngine: healingFind executa self-healing completo", async () => {
  const driver = makeDriver({ existing: [HEALED_ID], pageSource: XML_ID_BUTTON });
  healingEngine.configure(driver, "spec-heal");

  const element = await healingEngine.healingFind(ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.ok(driver.created.includes(HEALED_ID));
  assert.equal(selectorHistory.find(ORIGINAL, "spec-heal").newSelector, HEALED_ID);
});

test("healingEngine: healingFind usa histórico quando seletor é válido", async () => {
  const driver = makeDriver({ existing: [HEALED_ID], pageSource: "" });
  healingEngine.configure(driver, "spec-heal");

  const element = await healingEngine.healingFind(ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.ok(driver.created.includes(HEALED_ID));
  assert.equal(driver.created.filter((c) => c === HEALED_ID).length >= 2, true);
});

test("healingEngine: healingFind ignora histórico com useHistory:false", async () => {
  const driver = makeDriver({ existing: [HEALED_ID], pageSource: XML_ID_BUTTON });
  healingEngine.configure(driver, "spec-heal");

  const element = await healingEngine.healingFind(ORIGINAL, { useHistory: false });
  assert.equal(await element.isExisting(), true);
  assert.ok(driver.created.includes(HEALED_ID));
});

test("healingEngine: healingFind relança Self-Healing falhou sem elementos", async () => {
  const driver = makeDriver({ existing: [], pageSource: "<hierarchy/>" });
  healingEngine.configure(driver, "spec-vazio");

  await assert.rejects(
    healingEngine.healingFind(ORIGINAL),
    /Self-Healing falhou para seletor/,
  );
});

test("healingEngine: healingFind recupera mesmo com erro lançado pelo driver.$", async () => {
  const driver = makeDriver({
    errors: { [ORIGINAL]: new Error("boom driver") },
    existing: [HEALED_ID],
    pageSource: XML_ID_BUTTON,
  });
  healingEngine.configure(driver, "spec-driver-error");

  const element = await healingEngine.healingFind(ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.ok(driver.created.includes(HEALED_ID));
});

test("healingEngine: healingFind refaz análise quando seletor histórico é inválido", async () => {
  const step1 = makeDriver({ existing: [HEALED_ID], pageSource: XML_ID_BUTTON });
  healingEngine.configure(step1, "spec-reheal");
  await healingEngine.healingFind(ORIGINAL);

  const step2 = makeDriver({ existing: [TEXT_SELECTOR], pageSource: XML_TEXT_BUTTON });
  healingEngine.configure(step2, "spec-reheal");

  const element = await healingEngine.healingFind(ORIGINAL);
  assert.equal(await element.isExisting(), true);
  assert.ok(step2.created.includes(TEXT_SELECTOR));
});

test("healingEngine: healingFind lança quando não há candidatos válidos", async () => {
  const driver = makeDriver({ existing: [], pageSource: XML_TEXT_BUTTON });
  healingEngine.configure(driver, "spec-sem-candidato");

  const withoutMatch = 'android=new UiSelector().className("android.widget.Button").text("Sair")';
  await assert.rejects(
    healingEngine.healingFind(withoutMatch),
    /Nenhum candidato válido encontrado/,
  );
});

test("healingEngine: healingFind lança quando seletor recuperado é inválido", async () => {
  const driver = makeDriver({ existing: [], pageSource: XML_ID_BUTTON });
  healingEngine.configure(driver, "spec-invalido");

  await assert.rejects(healingEngine.healingFind(ORIGINAL), /Seletor recuperado não é válido/);
});

test("healingEngine: healingClick clica no elemento", async () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  healingEngine.configure(driver, "spec-click");

  await healingEngine.healingClick(ORIGINAL);
  assert.equal(driver.elements.at(-1).clicked, true);
});

test("healingEngine: healingSetText insere texto no elemento", async () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  healingEngine.configure(driver, "spec-settext");

  await healingEngine.healingSetText(ORIGINAL, "olá mundo");
  assert.deepEqual(driver.elements.at(-1).values, ["olá mundo"]);
});

test("healingEngine: healingGetText retorna texto do elemento", async () => {
  const driver = makeDriver({ existing: [ORIGINAL], texts: { [ORIGINAL]: "Saldo R$ 100" } });
  healingEngine.configure(driver, "spec-gettext");

  const text = await healingEngine.healingGetText(ORIGINAL);
  assert.equal(text, "Saldo R$ 100");
});

test("healingEngine: healingWaitForExist retorna direto quando elemento existe", async () => {
  const driver = makeDriver({ existing: [ORIGINAL] });
  healingEngine.configure(driver, "spec-wait-ok");

  await healingEngine.healingWaitForExist(ORIGINAL, 500);
  assert.equal(driver.created[0], ORIGINAL);
});

test("healingEngine: healingWaitForExist usa healing quando timeout", async () => {
  const driver = makeDriver({ existing: [HEALED_ID], pageSource: XML_ID_BUTTON });
  healingEngine.configure(driver, "spec-wait-heal");

  await healingEngine.healingWaitForExist(ORIGINAL, 500);
  assert.ok(driver.created.includes(HEALED_ID));
});

test("healingEngine: healingWaitForExist lança sem driver configurado", async () => {
  healingEngine.driver = null;
  await assert.rejects(healingEngine.healingWaitForExist(ORIGINAL), /não foi configurado/);
});

test("healingEngine: getStats expõe estado e histórico", async () => {
  healingEngine.setEnabled(true);
  const stats = healingEngine.getStats();
  assert.equal(stats.enabled, true);
  assert.equal(typeof stats.currentSpec, "string");
  assert.ok(stats.history.totalEntries >= 0);
});

test("healingEngine: exportReport grava relatório", () => {
  const outputPath = path.join(tmpDir, "engine-report.json");
  healingEngine.exportReport(outputPath);
  assert.equal(fs.existsSync(outputPath), true);
});

test("healingEngine: cleanupHistory limpa entradas antigas", () => {
  healingEngine.cleanupHistory(0);
  assert.equal(healingEngine.getStats().history.totalEntries, 0);
});

test("healingEngine: HEALING_DEBUG=true registra candidatos no debug", async () => {
  process.env.HEALING_DEBUG = "true";
  try {
    const driver = makeDriver({ existing: [HEALED_ID], pageSource: XML_ID_BUTTON });
    healingEngine.configure(driver, "spec-debug");
    const element = await healingEngine.healingFind(ORIGINAL);
    assert.equal(await element.isExisting(), true);
  } finally {
    delete process.env.HEALING_DEBUG;
  }
});

test("healingEngine: healingFind recupera com spec distinto sem colidir com histórico", async () => {
  const driver = makeDriver({ existing: [HEALED_ID], pageSource: XML_ID_BUTTON });
  healingEngine.configure(driver, "spec-final");
  const element = await healingEngine.healingFind(ORIGINAL);
  assert.equal(await element.isExisting(), true);
});