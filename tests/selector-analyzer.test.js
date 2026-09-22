import { test } from "node:test";
import assert from "node:assert/strict";
import selectorAnalyzer from "../src/selector-analyzer.js";

const sampleXml =
  '<hierarchy rotation="0"><' +
  'android.widget.TextView resource-id="com.app:id/txt_title" text="Título" content-desc="" ' +
  'clickable="false" enabled="true" bounds="[0,0][100,50]"/>' +
  '<android.widget.Button resource-id="" text="Entrar" content-desc="Botão Entrar" ' +
  'clickable="true" enabled="true" bounds="[0,50][200,100]"/>' +
  '<android.view.ViewGroup resource-id="com.app:id" text="" content-desc="" ' +
  'clickable="true" enabled="true" bounds="[0,0][1,1]"/>' +
  "</hierarchy>";

test("selectorAnalyzer: parsePageSource extrai apenas elementos relevantes", () => {
  const elements = selectorAnalyzer.parsePageSource(sampleXml);

  // TextView (id+texto), Button (clickable+text) e ViewGroup com id entram;
  // o terceiro ViewGroup não aparece no XML de exemplo, então são 3.
  assert.equal(elements.length, 3);
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