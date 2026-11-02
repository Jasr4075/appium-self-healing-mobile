/**
 * Gera dados sintéticos de teste para validar o pipeline de análise.
 *
 * NÃO é parte do experimento: serve apenas para conferir que `analyze.js`
 * calcula corretamente a matriz de confusão a partir de uma simulação.
 * Escrita em `dados/teste-sintetico/` para não tocar nos dados reais.
 *
 * Uso: node experimento/testar-analise.js
 */

import fs from "node:fs";
import path from "node:path";
import { gerarMatriz, TAU_PADRAO } from "./lib/matriz.js";
import { fileURLToPath } from "node:url";
import { SPEC_EXPERIMENTO } from "./lib/paths.js";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(RAIZ, "dados", "teste-sintetico");

// Os relatórios sintéticos ficam sob o diretório do próprio teste. Sem
// isso, o teste sobrescreveria a evidência real das células, que é
// insubstituível: ela exige uma nova coleta no aparelho.
const DIR_LOG = path.join(DIR, "logs");

/** Comportamento simulado por mutação em cada limiar. */
const SIMULADO = {
  M1: { 0.6: "cura", 0.7: "cura", 0.8: "cura" },
  M2: { 0.6: "cura", 0.7: "cura", 0.8: "cura" },
  M3: { 0.6: "errado", 0.7: "errado", 0.8: "recusa" },
  M4: { 0.6: "cura", 0.7: "cura", 0.8: "cura" },
  M5: { 0.6: "recusa", 0.7: "recusa", 0.8: "recusa" },
  M6: { 0.6: "errado", 0.7: "errado", 0.8: "recusa" },
};

const SCORES = { M1: 0.84, M2: 0.87, M3: 0.75, M4: 0.9, M5: 0.5, M6: 0.75 };

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const registros = [];

for (const celula of gerarMatriz()) {
  const { id, mutacao, config, grupo, tau, repeticao } = celula;
  const entradas = [];

  if (mutacao) {
    const desfecho = mutacao === "M5" ? SIMULADO.M5[tau] : SIMULADO[mutacao][tau];

    if (desfecho === "cura" || desfecho === "errado") {
      entradas.push({
        originalSelector: "~AppButton[contentDescription='Entrar']",
        newSelector: "~AppButton.contentDescription('Entrar').instance(0)",
        score: SCORES[mutacao],
        reasons: ["id-exact", "desc-similar", "class-same"],
        spec: "LoginEmail.spec.js",
        timestamp: new Date().toISOString(),
        success: true,
        context: { totalCandidates: 12, validCandidates: 2 },
      });
    }
  }

  const curou = entradas.length > 0;
  const desfecho = mutacao
    ? mutacao === "M5"
      ? SIMULADO.M5[tau]
      : SIMULADO[mutacao][tau]
    : "cura";

  {
    const idRepeticao = id;
    if (repeticao < 1) throw new Error(`repetição inválida em ${id}`);

    if (curou) {
      const dir = path.join(DIR_LOG, idRepeticao);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "healing-report.json"),
        JSON.stringify(
          { generatedAt: new Date().toISOString(), statistics: {}, entries: entradas },
          null,
          2,
        ),
        "utf8",
      );
    }

    registros.push({
      celula: idRepeticao,
      spec: SPEC_EXPERIMENTO,
      mutacao,
      config,
      grupo,
      tau: config === "controle" ? null : (tau ?? TAU_PADRAO),
      iniciada: new Date().toISOString(),
      fim: new Date().toISOString(),
      duracaoMs: 120000 + Math.round(Math.random() * 30000),
      passado: desfecho === "cura",
      tentativas: curou ? 1 : 0,
      curas: curou ? 1 : 0,
      score: curou ? SCORES[mutacao] : null,
      entradasHistorico: curou ? 1 : 0,
      arquivosRestaurados: mutacao ? 4 : 3,
      appLimpo: true,
      dryRun: false,
    });
  }
}

fs.writeFileSync(
  path.join(DIR, "resultados.jsonl"),
  `${registros.map((r) => JSON.stringify(r)).join("\n")}\n`,
  "utf8",
);

const revisao = {};
for (const r of registros) {
  if (r.mutacao && r.curas > 0) {
    const desfecho = SIMULADO[r.mutacao][r.tau];
    revisao[r.celula] = desfecho === "cura" ? "correto" : "errado";
  }
}
fs.writeFileSync(path.join(DIR, "revisao-manual.json"), JSON.stringify(revisao, null, 2), "utf8");

console.log(`${registros.length} registros sintéticos`);
console.log(`Resultados: ${path.join(DIR, "resultados.jsonl")}`);
console.log(`Relatórios: ${DIR_LOG}/<célula>/healing-report.json`);
console.log(`Revisão:    ${path.join(DIR, "revisao-manual.json")}`);
