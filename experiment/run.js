/**
 * Orquestrador da fase experimental (Capítulo 5).
 *
 * Para cada célula da matriz pré-registrada:
 *   1. verifica a árvore do app e registra o commit;
 *   2. aplica a instrumentação do sujeito;
 *   3. aplica a mutação da célula (quando existe);
 *   4. compila e reinstala o APK;
 *   5. executa o spec com as variáveis da célula;
 *   6. coleta duração, saída, relatório de cura e page source;
 *   7. reverte todos os patches e confere a limpeza.
 *
 * O repositório do app nunca é commitado e termina exatamente como começou.
 *
 * Uso:
 *   node experimento/run.js                       # matriz completa
 *   node experimento/run.js --somente=M1,M3        # apenas duas mutações
 *   node experimento/run.js --repeticoes=5
 *   node experimento/run.js --dry-run              # sem build, dispositivo e wdio
 *   node experimento/run.js --pular-build          # reaproveita o APK instalado
 *   node experimento/run.js --de=M1                # executa uma célula isolada
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { patchBaseline } from "./patches/baseline.js";
import { buscarMutacao } from "./patches/mutations.js";
import { aplicarPatch, restaurarArvore, verificarArvore } from "./lib/patch.js";
import { gerarMatriz, contarBuilds, TAU_PADRAO } from "./lib/matriz.js";
import { spawn } from "node:child_process";
import {
  verificarDispositivo,
  construirApk,
  reinstalarApp,
  capturarPageSource,
  limparEstadoDeCura,
  arquivarRelatorioCura,
  contarHistorico,
  aquecerBundle,
} from "./lib/dispositivo.js";
import {
  RAIZ_APP,
  RAIZ_TCC,
  RAIZ_EXPERIMENTO,
  DIR_DADOS,
  DIR_LOG_EXPERIMENTO,
  RELATORIO_CURA,
  HISTORICO_CURA,
  SPEC_EXPERIMENTO,
  caminhoApk,
} from "./lib/paths.js";

/**
 * Conjuntos de patches já compilados nesta execução.
 *
 * Todas as células com a mesma mutação produzem exatamente o mesmo APK, então
 * compilar uma vez por mutação (e uma vez para o baseline) é suficiente.
 */
const APK_CACHED = new Set();

/**
 * Impressão digital dos fontes alterados de uma célula.
 *
 * @param {string[]} arquivos - Caminhos relativos alterados
 * @returns {Object} Mapa caminho -> SHA-256
 */
function impressaoDigitalFontes(arquivos) {
  return Object.fromEntries(
    arquivos
      .map((a) => [
        a,
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(RAIZ_APP, a)))
          .digest("hex"),
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/**
 * Literais que precisam estar presentes no bundle JavaScript da célula.
 *
 * Extraídos dos `testID` presentes nos fontes já alterados, provam que o APK
 * empacotado corresponde a esta célula e não a um build anterior. Sem essa
 * checagem, um bundle reaproveitado pelo cache do Gradle passaria despercebido
 * e a mutação jamais chegaria ao aparelho.
 *
 * @param {string[]} arquivos - Caminhos relativos alterados
 * @returns {string[]} Marcadores esperados
 */
function marcadoresDoBundle(arquivos) {
  const marcadores = new Set();

  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(path.join(RAIZ_APP, arquivo), "utf8");
    for (const [, id] of conteudo.matchAll(/testID=["'`]([^"'`]+)["'`]/g)) {
      marcadores.add(id);
    }
  }

  return [...marcadores];
}

/**
 * Lê os argumentos de linha de comando.
 * @param {string[]} argv - Argumentos
 * @returns {Object} Opções
 */
function lerArgumentos(argv) {
  const opcoes = { dryRun: false, pularBuild: false, reiniciar: false, celular: undefined };

  for (const arg of argv) {
    const [chave, valor] = arg.replace(/^--/, "").split("=");
    if (chave === "somente") opcoes.mutacoes = valor.split(",");
    else if (chave === "repeticoes") opcoes.repeticoes = Number(valor);
    else if (chave === "taus") opcoes.taus = valor.split(",").map(Number);
    else if (chave === "de") opcoes.celula = valor;
    else if (chave === "dry-run") opcoes.dryRun = true;
    else if (chave === "pular-build") opcoes.pularBuild = true;
    else if (chave === "sem-controle") opcoes.executarControle = false;
    else if (chave === "celular") opcoes.celular = valor;
    else if (chave === "reiniciar") opcoes.reiniciar = true;
    else if (chave === "metro") opcoes.metro = true;
  }

  return opcoes;
}

/**
 * Grava uma linha de resultado em JSONL (append), um registro por célula.
 *
 * Execuções de dry-run vão para um arquivo separado, para que a verificação de
 * integridade dos patches nunca seja contada como coleta de dados.
 *
 * @param {Object} registro - Registro da célula
 * @param {Object} opcoes - Opções da execução
 */
function registrar(registro, opcoes) {
  fs.mkdirSync(DIR_DADOS, { recursive: true });
  const destino = opcoes.dryRun
    ? path.join(DIR_DADOS, "matriz-dry-run.jsonl")
    : path.join(DIR_DADOS, "resultados.jsonl");

  fs.appendFileSync(destino, `${JSON.stringify(registro)}\n`, "utf8");
}

/**
 * Executa o spec da célula e devolve os indicadores da execução.
 * @param {Object} celula - Célula em execução
 * @param {string} dirCelula - Diretório de artefatos da célula
 * @returns {Object} Resultado
 */
function executarSpec(celula, dirCelula) {
  const env = {
    ...process.env,
    SELF_HEALING_ENABLED: celula.config === "tratamento" ? "true" : "false",
  };

  if (celula.config === "tratamento") {
    env.HEALING_MIN_THRESHOLD = String(celula.tau ?? TAU_PADRAO);
  }

  limparEstadoDeCura(RELATORIO_CURA, HISTORICO_CURA);

  const inicio = Date.now();
  const proc = spawnSync("npx", ["wdio", "run", "./wdio.conf.js", "--spec", SPEC_EXPERIMENTO], {
    cwd: RAIZ_TCC,
    env,
    encoding: "utf8",
  });
  const duracaoMs = Date.now() - inicio;

  fs.mkdirSync(dirCelula, { recursive: true });
  fs.writeFileSync(path.join(dirCelula, "wdio-stdout.log"), proc.stdout ?? "", "utf8");
  fs.writeFileSync(path.join(dirCelula, "wdio-stderr.log"), proc.stderr ?? "", "utf8");

  if (fs.existsSync(RELATORIO_CURA)) {
    fs.copyFileSync(RELATORIO_CURA, path.join(dirCelula, "healing-report.json"));
  }

  return {
    Passed: proc.status === 0,
    exitCode: proc.status,
    duracaoMs,
    entradasHistorico: contarHistorico(HISTORICO_CURA),
  };
}

const opcoes = lerArgumentos(process.argv.slice(2));
const celulas = gerarMatriz(opcoes);
const alvo = opcoes.celula
  ? celulas.filter(
      (c) =>
        c.id === opcoes.celula || c.mutacao === opcoes.celula || c.id.startsWith(opcoes.celula),
    )
  : celulas;

console.log("=".repeat(72));
console.log("FASE EXPERIMENTAL — CAPÍTULO 5");
console.log("=".repeat(72));
console.log(`Sujeito : ${RAIZ_APP}`);
console.log(`Banco   : ${RAIZ_TCC}`);
console.log(`Spec    : ${SPEC_EXPERIMENTO}`);
console.log(
  `Células : ${alvo.length} de ${celulas.length} (${contarBuilds(alvo)} builds previstos)`,
);
console.log(
  `Opções  : ${opcoes.dryRun ? "DRY-RUN (sem build/dispositivo)" : "execução real"}` +
    `${opcoes.pularBuild ? " | pulando build" : ""}`,
);
console.log("=".repeat(72));

if (!opcoes.dryRun) {
  const anteriores = path.join(DIR_DADOS, "resultados.jsonl");

  if (opcoes.reiniciar && fs.existsSync(anteriores)) {
    fs.rmSync(anteriores);
    console.log("Resultados anteriores removidos (--reiniciar).");
  } else if (fs.existsSync(anteriores)) {
    const linhas = fs.readFileSync(anteriores, "utf8").split("\n").filter(Boolean).length;
    console.log(
      `Aviso: ${linhas} resultado(s) anterior(es) em dados/resultados.jsonl serão mantidos. ` +
        "Use --reiniciar para começar do zero.",
    );
  }
  console.log("");

  const estado = verificarArvore(RAIZ_APP);
  console.log(
    `App no commit ${estado.commit.slice(0, 8)} (branch ${estado.branch}), árvore limpa.`,
  );

  const { dispositivos, ok } = verificarDispositivo();
  if (!ok) {
    console.error("\nNenhum dispositivo conectado. Conecte o aparelho e rode de novo.");
    process.exit(1);
  }

  if (opcoes.celular && !dispositivos.includes(opcoes.celular)) {
    console.error(
      `\nO aparelho ${opcoes.celular} não está conectado. Conectados: ${dispositivos.join(", ")}`,
    );
    process.exit(1);
  }

  console.log(`Dispositivo: ${opcoes.celular ?? dispositivos.join(", ")}`);
  console.log("");
}

/**
 * Interrompe a execução e devolve o app ao estado original.
 * @param {string} sinal - Sinal recebido
 */
function encerrar(sinal) {
  const restaurados = restaurarArvore(RAIZ_APP);
  console.error(
    `\nInterrompido por ${sinal}: ${restaurados.length} arquivo(s) restaurado(s) no app.`,
  );
  process.exit(130);
}

for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sinal, () => encerrar(sinal));
}

/**
 * Inicia o vigia que restaura o app se este processo for encerrado à força.
 *
 * O bloco `finally` não roda em SIGKILL, então o vigia é a segunda linha de
 * defesa. Ele é desacoplado (`detached` + `unref`) para não cair junto com o
 * runner.
 */
function iniciarVigia() {
  if (opcoes.dryRun) return;

  const log = path.join(DIR_DADOS, "vigia.log");
  const vigia = spawn(
    process.execPath,
    [path.join(RAIZ_EXPERIMENTO, "lib", "vigilante.js"), String(process.pid), log],
    { detached: true, stdio: "ignore" },
  );

  vigia.unref();
  console.log(`Vigia do app ativo (pid ${vigia.pid}, log: ${log})`);
}

iniciarVigia();

let executadas = 0;
let falhas = 0;

for (const celula of alvo) {
  const mutacao = celula.mutacao ? buscarMutacao(celula.mutacao) : null;
  const cabecalho = `[${celula.id}] ${mutacao ? mutacao.nome : "baseline (sem mutação)"}`;

  console.log(cabecalho);
  console.log(`-`.repeat(Math.min(72, cabecalho.length)));
  console.log(
    `  config=${celula.config} τ=${celula.tau ?? "-"} mutação=${celula.mutacao ?? "nenhuma"}`,
  );

  const dirCelula = path.join(DIR_LOG_EXPERIMENTO, celula.id);
  fs.mkdirSync(dirCelula, { recursive: true });

  const arquivos = [];
  const registro = {
    celula: celula.id,
    mutacao: celula.mutacao,
    config: celula.config,
    repeticao: celula.repeticao,
    tau: celula.tau,
    grupo: celula.grupo,
    inicio: new Date().toISOString(),
  };

  try {
    const base = aplicarPatch(RAIZ_APP, patchBaseline());
    arquivos.push(...base.arquivos);
    console.log(`  instrumentação aplicada (${base.edicoes} edições)`);

    if (mutacao) {
      const aplicada = aplicarPatch(RAIZ_APP, mutacao);
      arquivos.push(...aplicada.arquivos);
      console.log(`  mutação aplicada (${aplicada.edicoes} edições)`);
    }

    if (opcoes.dryRun) {
      registro.dryRun = true;
      console.log("  dry-run: patch aplicado com sucesso");
    } else {
      if (opcoes.metro) {
        const aquecimento = await aquecerBundle();
        registro.msAquecimento = aquecimento.ms;
        console.log(
          `  bundle do Metro pronto (${(aquecimento.ms / 1000).toFixed(1)}s, ${(aquecimento.bytes / 1e6).toFixed(1)} MB)`,
        );
      }

      const conjunto = mutacao ? mutacao.id : "baseline";
      const precisaCompilar =
        !opcoes.pularBuild && (!APK_CACHED.has(conjunto) || !fs.existsSync(caminhoApk()));

      if (precisaCompilar) {
        console.log("  gerando bundle e compilando APK release...");
        const inicioBuild = Date.now();
        const apk = construirApk({ marcadores: marcadoresDoBundle(arquivos) });
        registro.buildMs = Date.now() - inicioBuild;
        registro.apkSha256 = apk.sha256;
        registro.apkBytes = apk.bytes;
        registro.bundleSha256 = apk.bundleSha256;
        reinstalarApp(apk.caminho);
        APK_CACHED.add(conjunto);
        console.log(
          `  APK reinstalado (${(registro.buildMs / 1000).toFixed(0)}s de build, ` +
            `${(apk.bytes / 1e6).toFixed(0)} MB, sha256 ${apk.sha256.slice(0, 12)})`,
        );
      } else if (opcoes.pularBuild) {
        console.log("  build pulado: usando o APK já instalado");
      } else {
        registro.buildReutilizado = true;
        const apk = caminhoApk();
        registro.apkSha256 = crypto.createHash("sha256").update(fs.readFileSync(apk)).digest("hex");
        registro.apkBytes = fs.statSync(apk).size;
        reinstalarApp(apk);
        console.log("  APK do mesmo conjunto de patches, sem recompilar");
      }

      registro.fontes = impressaoDigitalFontes(arquivos);

      const execucao = executarSpec(celula, dirCelula);
      const relatorioCura = arquivarRelatorioCura(dirCelula);
      registro.decisoesCura = relatorioCura.entries.length;
      registro.curas = relatorioCura.entries.filter((e) => e.success).length;
      Object.assign(registro, execucao, { passado: execucao.Passed });
      console.log(
        `  spec ${execucao.Passed ? "PASSOU" : "FALHOU"} em ${(execucao.duracaoMs / 1000).toFixed(1)}s`,
      );

      try {
        capturarPageSource(path.join(dirCelula, "page-source.xml"));
      } catch {
        console.log("  (page source não obtido)");
      }
    }

    executadas++;
  } catch (erro) {
    falhas++;
    registro.erro = erro.message;
    console.log(`  ERRO: ${erro.message}`);
  } finally {
    const restaurados = restaurarArvore(RAIZ_APP);
    registro.arquivosRestaurados = restaurados;

    const arvoreLimpa = verificarArvore(RAIZ_APP);
    registro.appLimpo = true;

    if (restaurados.length === 0) {
      console.log("  nada a reverter");
    } else {
      console.log(
        `  app restaurado ao commit ${arvoreLimpa.commit.slice(0, 8)} (${restaurados.length} arquivo(s))`,
      );
    }

    registro.fim = new Date().toISOString();
    registrar(registro, opcoes);
    console.log("");
  }
}

console.log("=".repeat(72));
console.log(`Concluído: ${executadas} célula(s) executada(s), ${falhas} com erro.`);
console.log(
  opcoes.dryRun
    ? `Dry-run: ${path.join(DIR_DADOS, "matriz-dry-run.jsonl")} (não entra na análise)`
    : `Resultados: ${path.join(DIR_DADOS, "resultados.jsonl")}`,
);
console.log(`Análise   : npm run exp:analisar`);
console.log("=".repeat(72));

process.exit(falhas > 0 ? 1 : 0);
