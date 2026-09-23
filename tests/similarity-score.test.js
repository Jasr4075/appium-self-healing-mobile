import { test } from "node:test";
import assert from "node:assert/strict";
import similarityScore from "../src/similarity-score.js";

function captureWarn() {
  const calls = [];
  const original = console.warn;
  console.warn = (...args) => calls.push(args.join(" "));
  return {
    calls,
    restore() {
      console.warn = original;
    },
  };
}

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

test("similarityScore: parseSelector extrai resourceId do UiSelector como tipo id", () => {
  const info = similarityScore.parseSelector(
    'android=new UiSelector().resourceId("com.app:id/btn_ok")',
  );
  assert.equal(info.type, "id");
  assert.equal(info.id, "com.app:id/btn_ok");
});

test("similarityScore: parseSelector detecta resourceId e @text em XPath", () => {
  const byId = similarityScore.parseSelector('//android.widget.Button[@resource-id="btn_ok"]');
  assert.equal(byId.type, "id");
  assert.equal(byId.id, "btn_ok");

  const byText = similarityScore.parseSelector("//*[@text='Entrar']");
  assert.equal(byText.type, "text");
  assert.equal(byText.text, "Entrar");
});

test("similarityScore: parseSelector trata XPath sem valor nos atributos", () => {
  const noValueId = similarityScore.parseSelector("//*[@resource-id]");
  assert.equal(noValueId.type, "id");
  assert.equal(noValueId.id, null);

  const noValueText = similarityScore.parseSelector("//*[@text]");
  assert.equal(noValueText.type, "text");
  assert.equal(noValueText.text, null);

  const alone = similarityScore.parseSelector("android.widget");
  assert.equal(alone.type, "class");
  assert.equal(alone.class, null);
});

test("similarityScore: parseSelector infere tipo class de seletor android.widget", () => {
  const info = similarityScore.parseSelector("android.widget.Button");
  assert.equal(info.type, "class");
  assert.equal(info.class, "android.widget.Button");
});

test("similarityScore: calculateTextSimilarity retorna 1.0 para match exato", () => {
  assert.equal(similarityScore.calculateTextSimilarity("Entrar", "entrar"), 1.0);
});

test("similarityScore: calculateTextSimilarity retorna 0.9 para substring", () => {
  assert.equal(similarityScore.calculateTextSimilarity("Entrar", "Entrar de novo"), 0.9);
});

test("similarityScore: calculateTextSimilarity usa prefixo longo compartilhado", () => {
  const score = similarityScore.calculateTextSimilarity("Entrar no sistema", "Entrar no app");
  assert.ok(score >= 0.7);
});

test("similarityScore: calculateTextSimilarity usa Levenshtein quando não há prefixo", () => {
  const score = similarityScore.calculateTextSimilarity("Entrar", "Sair");
  assert.ok(score >= 0 && score < 0.7);
});

test("similarityScore: calculateTextSimilarity retorna 0 para entradas vazias", () => {
  assert.equal(similarityScore.calculateTextSimilarity("", "x"), 0);
  assert.equal(similarityScore.calculateTextSimilarity(null, "x"), 0);
});

test("similarityScore: levenshteinDistance calcula distância conhecida", () => {
  assert.equal(similarityScore.levenshteinDistance("kitten", "sitting"), 3);
  assert.equal(similarityScore.levenshteinDistance("abc", "abc"), 0);
});

test("similarityScore: isPartialMatch encontra parte comum entre IDs", () => {
  assert.ok(similarityScore.isPartialMatch("btn_submit", "com.app:id/btn_submit"));
  assert.ok(!similarityScore.isPartialMatch("nome_usuario", "botao_confirma"));
});

test("similarityScore: isPartialMatch retorna false para entradas vazias", () => {
  assert.equal(similarityScore.isPartialMatch("", "abc"), false);
  assert.equal(similarityScore.isPartialMatch("abc", null), false);
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

  assert.equal(result.score, 0.7);
  assert.ok(result.reasons.includes("text-exact"));
  assert.ok(result.reasons.includes("class-exact"));
  assert.ok(result.isValid);
});

test("similarityScore: calculate usa class-similar para classes da mesma família", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().className("android.widget.Button")',
    { class: "android.widget.Button2", index: 0 },
  );

  assert.equal(result.breakdown.class, 0.5);
  assert.ok(result.reasons.includes("class-similar"));
});

test("similarityScore: calculate gera text-similar para texto parecido", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().text("Entrar no sistema")',
    { text: "Entrar no app", index: 0 },
  );

  assert.equal(result.breakdown.text, 0.7);
  assert.ok(result.reasons.includes("text-similar"));
});

test("similarityScore: calculate não gera reason quando texto diverge", () => {
  const result = similarityScore.calculate('android=new UiSelector().text("abc")', {
    text: "xyz",
  });

  assert.ok(!result.reasons.includes("text-exact"));
  assert.ok(!result.reasons.includes("text-similar"));
});

test("similarityScore: calculate usa id-exact para IDs iguais", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().resourceId("com.app:id/btn_ok")',
    { id: "com.app:id/btn_ok", index: 0 },
  );

  assert.equal(result.breakdown.id, 1.0);
  assert.ok(result.reasons.includes("id-exact"));
});

test("similarityScore: calculate usa id-partial para IDs com parte comum", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().resourceId("btn_ok")',
    { id: "com.app:id/btn_ok", index: 0 },
  );

  assert.equal(result.breakdown.id, 0.7);
  assert.ok(result.reasons.includes("id-partial"));
});

test("similarityScore: calculate pontua posição a partir do instance e o transforma em reason", () => {
  const expectations = [
    [0, 0.7],
    [1, 0.9],
    [2, 1.0],
    [5, 0.5],
    [10, 0.2],
  ];

  for (const [candidateIndex, expected] of expectations) {
    const result = similarityScore.calculate(
      'android=new UiSelector().className("android.widget.Button").instance(2)',
      { class: "android.widget.Button", index: candidateIndex },
    );
    assert.equal(result.breakdown.position, expected);
  }

  const close = similarityScore.calculate(
    'android=new UiSelector().className("android.widget.Button").instance(2)',
    { class: "android.widget.Button", index: 3 },
  );
  assert.ok(close.reasons.includes("position-close"));
});

test("similarityScore: calculate aceita originalIndex explícito sobre o instance", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().className("android.widget.Button").instance(2)',
    { class: "android.widget.Button", index: 0 },
    0,
  );

  assert.equal(result.breakdown.position, 1.0);
});

test("similarityScore: calculate zera scores sem candidato correspondente", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().className("android.widget.Button").text("abc")',
    { text: "xyz", index: 9 },
  );

  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.isValid, false);
});

test("similarityScore: calculate ignora blocos quando candidato não tem atributos", () => {
  const result = similarityScore.calculate(
    'android=new UiSelector().className("android.widget.Button").text("Entrar")',
    { index: 3 },
  );

  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});

test("similarityScore: calculatePositionSimilarity mapeia diferenças para scores", () => {
  assert.equal(similarityScore.calculatePositionSimilarity(5, 5), 1.0);
  assert.equal(similarityScore.calculatePositionSimilarity(5, 6), 0.9);
  assert.equal(similarityScore.calculatePositionSimilarity(5, 7), 0.7);
  assert.equal(similarityScore.calculatePositionSimilarity(5, 10), 0.5);
  assert.equal(similarityScore.calculatePositionSimilarity(5, 20), 0.2);
});

test("similarityScore: filterValidCandidates ordena e respeita threshold", () => {
  const results = [{ score: 0.5 }, { score: 0.95 }, { score: 0.75 }, { score: 0.71 }];

  const valid = similarityScore.filterValidCandidates(results);

  assert.equal(valid.length, 3);
  assert.ok(valid[0].score >= valid[1].score);
  assert.ok(valid[0].score >= similarityScore.MIN_THRESHOLD);
});

test("similarityScore: getMinThreshold respeita HEALING_MIN_THRESHOLD", () => {
  assert.equal(similarityScore.getMinThreshold(), 0.7);

  process.env.HEALING_MIN_THRESHOLD = "0.5";
  try {
    assert.equal(similarityScore.getMinThreshold(), 0.5);
  } finally {
    delete process.env.HEALING_MIN_THRESHOLD;
  }
});

test("similarityScore: getWeights retorna pesos padrão e avisa quando soma difere de 1", () => {
  const weights = similarityScore.getWeights();
  assert.deepEqual(weights, { class: 0.4, text: 0.3, id: 0.2, position: 0.1 });

  process.env.HEALING_WEIGHT_CLASS = "0.9";
  const spy = captureWarn();
  try {
    similarityScore.getWeights();
  } finally {
    delete process.env.HEALING_WEIGHT_CLASS;
  }
  spy.restore();
  assert.ok(spy.calls.some((call) => call.includes("Soma dos pesos")));
});