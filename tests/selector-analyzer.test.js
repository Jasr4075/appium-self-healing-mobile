import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockDriver } from "./helpers/mock-driver.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sh-analyzer-"));

process.env.HEALING_LOG_DIR = path.join(tmpDir, "logs");
process.env.HEALING_HISTORY_PATH = path.join(tmpDir, "history.json");

const { default: selectorAnalyzer } = await import("../src/selector-analyzer.js");

const sampleXml =
  '<hierarchy rotation="0"><' +
  'android.widget.TextView resource-id="com.app:id/txt_title" text="Título" content-desc="" ' +
  'clickable="false" enabled="true" bounds="[0,0][100,50]"/>' +
  '<android.widget.Button resource-id="" text="Entrar" content-desc="Botão Entrar" ' +
  'clickable="true" enabled="true" bounds="[0,50][200,100]"/>' +
  '<android.view.ViewGroup resource-id="com.app:id" text="" content-desc="" ' +
  'clickable="true" enabled="true" bounds="[0,0][1,1]"/>' +
  "</hierarchy>";

const listXml =
  '<hierarchy>' +
  '<android.widget.Button resource-id="com.app:id/btn_login" text="Entrar" content-desc="" ' +
  'clickable="true" enabled="true" bounds="[0,50][200,100]"/>' +
  '<android.widget.Button resource-id="com.app:id/btn_logout" text="Sair" content-desc="" ' +
  'clickable="true" enabled="true" bounds="[0,150][200,200]"/>' +
  '<android.widget.TextView resource-id="com.app:id/lbl" text="Título" content-desc="" ' +
  'clickable="false" enabled="true" bounds="[0,0][100,50]"/>' +
  "</hierarchy>";

test("selectorAnalyzer: parsePageSource extrai apenas elementos relevantes", () => {
  const elements = selectorAnalyzer.parsePageSource(sampleXml);
  assert.equal(elements.length, 3);
});

test("selectorAnalyzer: parsePageSource descarta elementos irrelevantes", () => {
  const filterXml =
    "<hierarchy>" +
    '<android.widget.Button resource-id="com.app:id/ok" text="Entrar" content-desc="" ' +
    'clickable="true" enabled="true"/>' +
    '<android.widget.ImageView resource-id="" text="" content-desc="" ' +
    'clickable="false" enabled="false"/>' +
    '<android.widget.EditText resource-id="com.app:id/field" text="x" content-desc="" ' +
    'clickable="false" enabled="false"/>' +
    '<android.view.ViewGroup resource-id="" text="" content-desc="label" ' +
    'clickable="true" enabled="true"/>' +
    "</hierarchy>";

  const elements = selectorAnalyzer.parsePageSource(filterXml);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].class, "android.widget.Button");
});

test("selectorAnalyzer: extractAttributes normaliza atributos", () => {
  const el = selectorAnalyzer.parsePageSource(sampleXml)[0];

  assert.equal(el.class, "android.widget.TextView");
  assert.equal(el.id, "com.app:id/txt_title");
  assert.equal(el.text, "Título");
  assert.equal(el.clickable, false);
  assert.equal(el.enabled, true);
  assert.equal(el.bounds, "[0,0][100,50]");
});

test("selectorAnalyzer: isVisible valida bounds positivos", () => {
  assert.ok(selectorAnalyzer.isVisible("[0,0][100,50]"));
  assert.ok(selectorAnalyzer.isVisible("[0,0][1,1]"));
  assert.ok(!selectorAnalyzer.isVisible(null));
  assert.ok(!selectorAnalyzer.isVisible("inválido"));
  assert.ok(!selectorAnalyzer.isVisible("[0,0][0,50]"));
  assert.ok(!selectorAnalyzer.isVisible("[-5,0][10,10]"));
});

test("selectorAnalyzer: setDriver armazena driver", () => {
  const driver = new MockDriver();
  selectorAnalyzer.setDriver(driver);
  assert.equal(selectorAnalyzer.driver, driver);
});

test("selectorAnalyzer: getScreenElements lança sem driver", async () => {
  selectorAnalyzer.driver = null;
  await assert.rejects(selectorAnalyzer.getScreenElements(), /Driver não foi configurado/);
});

test("selectorAnalyzer: getScreenElements retorna elementos do page source", async () => {
  const driver = new MockDriver({ pageSource: listXml });
  selectorAnalyzer.setDriver(driver);

  const elements = await selectorAnalyzer.getScreenElements();
  assert.equal(elements.length, 3);
});

test("selectorAnalyzer: getScreenElements relança erro do getPageSource", async () => {
  const driver = new MockDriver({
    pageSource: () => {
      throw new Error("falha de rede");
    },
  });
  selectorAnalyzer.setDriver(driver);

  await assert.rejects(selectorAnalyzer.getScreenElements(), /falha de rede/);
});

test("selectorAnalyzer: findSimilarElements filtra por class/id/text", async () => {
  const driver = new MockDriver({ pageSource: listXml });
  selectorAnalyzer.setDriver(driver);

  const byClass = await selectorAnalyzer.findSimilarElements({ class: "android.widget.Button" });
  assert.equal(byClass.length, 2);

  const byId = await selectorAnalyzer.findSimilarElements({ id: "btn_" });
  assert.equal(byId.length, 2);

  const byText = await selectorAnalyzer.findSimilarElements({ text: "Entrar" });
  assert.equal(byText.length, 1);

  const all = await selectorAnalyzer.findSimilarElements({});
  assert.equal(all.length, 3);
});

test("selectorAnalyzer: createSelector prioriza resourceId completo", () => {
  const selector = selectorAnalyzer.createSelector({
    id: "com.app:id/btn_submit",
    contentDesc: "Enviar",
    text: "Enviar",
    class: "android.widget.Button",
  });

  assert.equal(
    selector,
    'android=new UiSelector().resourceId("com.app:id/btn_submit").instance(0)',
  );
});

test("selectorAnalyzer: createSelector usa resourceIdMatches para id curto", () => {
  const selector = selectorAnalyzer.createSelector({
    id: "btn_ok",
    class: "android.widget.Button",
  });

  assert.equal(selector, 'android=new UiSelector().resourceIdMatches(".*btn_ok").instance(0)');
});

test("selectorAnalyzer: createSelector usa content-desc quando não há id", () => {
  const selector = selectorAnalyzer.createSelector({
    id: null,
    contentDesc: "Botão Entrar",
    text: "Entrar",
  });

  assert.equal(selector, "~Botão Entrar");
});

test("selectorAnalyzer: createSelector usa text sem id/cd", () => {
  const selector = selectorAnalyzer.createSelector({
    id: null,
    contentDesc: null,
    text: "Comprar",
    class: "android.widget.Button",
  });

  assert.equal(selector, 'android=new UiSelector().text("Comprar").instance(0)');
});

test("selectorAnalyzer: createSelector cai em className+index como fallback", () => {
  const selector = selectorAnalyzer.createSelector({
    id: null,
    contentDesc: null,
    text: null,
    class: "android.widget.Button",
    index: 3,
  });

  assert.equal(
    selector,
    'android=new UiSelector().className("android.widget.Button").instance(3)',
  );
});

test("selectorAnalyzer: isValidSelector reflete existência e captura erros", async () => {
  const selector = "sel-existe";
  const driver = new MockDriver({
    existing: [selector],
    errors: { "sel-quebra": new Error("boom") },
  });
  selectorAnalyzer.setDriver(driver);

  assert.equal(await selectorAnalyzer.isValidSelector(selector), true);
  assert.equal(await selectorAnalyzer.isValidSelector("sel-ausente"), false);
  assert.equal(await selectorAnalyzer.isValidSelector("sel-quebra"), false);
});

test("selectorAnalyzer: getScreenStats computa métricas da tela", async () => {
  const driver = new MockDriver({ pageSource: listXml });
  selectorAnalyzer.setDriver(driver);

  const stats = await selectorAnalyzer.getScreenStats();
  assert.equal(stats.totalElements, 3);
  assert.equal(stats.clickableElements, 2);
  assert.equal(stats.elementsWithId, 3);
  assert.equal(stats.elementsWithText, 3);
  assert.ok(stats.classes.includes("android.widget.Button"));
  assert.ok(stats.classes.includes("android.widget.TextView"));
});