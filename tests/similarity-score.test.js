import { test } from "node:test";
import assert from "node:assert/strict";
import similarityScore from "../src/similarity-score.js";

test("similarityScore: parseSelector detecta seletor de acessibilidade (~)", () => {
  const info = similarityScore.parseSelector("~btnEntrar");
  assert.equal(info.type, "accessibility");
  assert.equal(info.value, "btnEntrar");
});

test("similarityScore: parseSelector extrai text/class/id/instance do UiSelector", () => {
  const info = similarityScore.parseSelector(
    'android=new UiSelector().className("android.widget.Button").text("Entrar").instance(2)',
  );
  assert.equal(info.class, "android.widget.Button");
  assert.equal(info.text, "Entrar");
  assert.equal(info.instance, 2);
});

test("similarityScore: parseSelector detecta resourceId e @text em XPath", () => {
  // O parser de XPath reconhece atributos com aspas duplas.
  const byId = similarityScore.parseSelector("//android.widget.Button[@resource-id=\"btn_ok\"]");
  assert.equal(byId.type, "id");
  assert.equal(byId.id, "btn_ok");

  const byText = similarityScore.parseSelector("//*[@text='Entrar']");
  assert.equal(byText.type, "text");
  assert.equal(byText.text, "Entrar");
});

test("similarityScore: calculateTextSimilarity retorna 1.0 para match exato", () => {
  assert.equal(similarityScore.calculateTextSimilarity("Entrar", "entrar"), 1.0);
});

test("similarityScore: calculateTextSimilarity retorna 0.9 para substring", () => {
  assert.equal(similarityScore.calculateTextSimilarity("Entrar", "Entrar de novo"), 0.9);
});

test("similarityScore: calculateTextSimilarity usa Levenshtein quando não há prefixo", () => {
  const score = similarityScore.calculateTextSimilarity("Entrar", "Sair");
  assert.ok(score >= 0 && score < 0.7);
});

test("similarityScore: levenshteinDistance calcula distância conhecida", () => {
  assert.equal(similarityScore.levenshteinDistance("kitten", "sitting"), 3);
  assert.equal(similarityScore.levenshteinDistance("abc", "abc"), 0);
});

test("similarityScore: isPartialMatch encontra parte comum entre IDs", () => {
  assert.ok(similarityScore.isPartialMatch("btn_submit", "com.app:id/btn_submit"));
  assert.ok(!similarityScore.isPartialMatch("nome_usuario", "botao_confirma"));
});

test("similarityScore: calculate integra pesos e gera reasons", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().className("android.widget.Button").text("Comprar")',
    {
      class: "android.widget.Button",
      text: "Comprar",
      id: null,
      index: 1,
    },
  );

  // class (1.0 * 0.4) + text (1.0 * 0.3) = 0.7, o threshold mínimo.
  assert.equal(result.score, 0.7);
  assert.ok(result.reasons.includes("text-exact"));
  assert.ok(result.reasons.includes("class-exact"));
  assert.ok(result.isValid);
});

test("similarityScore: filterValidCandidates ordena e respeita threshold", () => {
  const results = [
    { score: 0.5 },
    { score: 0.95 },
    { score: 0.75 },
    { score: 0.71 },
  ];

  const valid = similarityScore.filterValidCandidates(results);

  assert.equal(valid.length, 3);
  assert.ok(valid[0].score >= valid[1].score);
  assert.ok(valid[0].score >= similarityScore.MIN_THRESHOLD);
});