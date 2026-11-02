/**
 * Análise dos resultados do experimento e geração das tabelas do Capítulo 5.
 *
 * Lê `dados/resultados.jsonl` (uma linha por execução), cruza com o relatório de
 * cura de cada célula e calcula:
 *
 *  - taxa de cura e número de mutações curadas;
 *  - precisão e recall das curas (TP / FP / FN), usando como_verdade o elemento
 *    declarado como alvo de cada mutação;
 *  - sensibilidade ao limiar τ;
 *  - custo de manutenção (tempo de reparo manual e número de seletores
 *    alterados, informados pelo autor nas execuções de controle);
 *  - crescimento do histórico de seletores curados.
 *
 * Gera `<diretório>/resultados.json` e `<diretório>/tabelas.md`, prontos para
 * o capítulo.
 *
 * Uso: node experimento/analyze.js [diretorio]
 */

import fs from "node:fs";
import path from "node:path";
import { MUTACOES } from "./patches/mutations.js";
import { gerarMatriz, TAU_PADRAO } from "./lib/matriz.js";
import { DIR_DADOS } from "./lib/paths.js";

/** Diretório dos dados, sobrescrevível pela linha de comando. */
const DIR_ANALISE = process.argv[2] ? path.resolve(process.argv[2]) : DIR_DADOS;
const ARQUIVO_RESULTADOS = path.join(DIR_ANALISE, "resultados.jsonl");

/**
 * Mutações cujo mecanismo de cura é capaz de recuperar o elemento segundo a
 * simulação analítica. Usadas para calcular falsos negativos: uma falha em M5
 * ou M6 não é falso negativo, é recusa correta.
 */
const CURAVEIS = ["M1", "M2", "M4"];

/**
 * Lê os resultados já coletados, ignorando execuções de dry-run.
 * @returns {Object[]} Registros
 */
function lerResultados() {
  if (!fs.existsSync(ARQUIVO_RESULTADOS)) {
    console.error(`Nenhum resultado em ${ARQUIVO_RESULTADOS}. Rode antes: npm run exp:executar`);
    process.exit(1);
  }

  return fs
    .readFileSync(ARQUIVO_RESULTADOS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((linha) => JSON.parse(linha))
    .filter((r) => !r.dryRun);
}

/**
 * Lê o relatório de cura de uma célula.
 * @param {string} celula - Identificador da célula
 * @returns {Object|null} Relatório
 */
function lerRelatorioCura(celula) {
  const arquivo = path.join(DIR_ANALISE, "logs", celula, "healing-report.json");

  if (!fs.existsSync(arquivo)) return null;

  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Extrai do relatório de cura as informações relevantes da decisão.
 *
 * O relatório exportado pela biblioteca tem o formato
 * `{ generatedAt, statistics, entries: HistoryEntry[] }`, em que cada entrada
 * com `success: true` significa que o mecanismo localizou e validou um
 * seletor substituto. Isso NÃO garante que o elemento ativado seja o correto:
 * a qualidade da cura é definida na etapa de revisão humana.
 *
 * @param {Object|null} relatorio - Relatório de cura
 * @returns {Object} Situação da cura
 */
function extrairCura(relatorio) {
  if (!relatorio) {
    return { curou: false, score: null, seletorCurado: null, reasons: null, tentativas: 0 };
  }

  const entradas = Array.isArray(relatorio.entries) ? relatorio.entries : [];
  const ativas = entradas.filter((e) => e.success);
  const ativa = ativas[ativas.length - 1];

  return {
    curou: ativas.length > 0,
    tentativas: entradas.length,
    score: ativa ? ativa.score : null,
    seletorCurado: ativa ? ativa.newSelector : null,
    reasons: ativa ? ativa.reasons : null,
  };
}

/**
 * Normaliza o campo de resultado do spec.
 *
 * `run.js` grava `passado`; versões anteriores gravavam `passou`, e o runner
 * também copia o `Passed` do WDIO. Aceitar os três evita que uma diferença de
 * nome zere silenciosamente toda a análise.
 *
 * @param {Object} registro - Registro da execução
 * @returns {boolean} Verdadeiro quando o spec passou
 */
function passouSpec(registro) {
  return registro.passado ?? registro.passou ?? registro.Passed ?? false;
}

/**
 * Carrega o tempo de reparo manual registrado nas execuções de controle.
 *
 * O reparo manual é uma ação humana e não pode ser medida por automação. O
 * autor preenche `dados/reparo-manual.json` após cada controle, no formato:
 *   { "M1-ctrl-r1": { "minutos": 7, "seletoresAlterados": 1 } }
 *
 * @returns {Object} Mapa célula → { minutos, seletoresAlterados }
 */
function lerReparoManual() {
  const arquivo = path.join(DIR_ANALISE, "reparo-manual.json");
  if (!fs.existsSync(arquivo)) return {};
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    console.error("Aviso: reparo-manual.json ilegível; custo de manutenção ficará vazio.");
    return {};
  }
}

/**
 * Carrega a revisão humana, quando existe.
 *
 * A revisão humana é o passo que separa "o mecanismo curou" de "o mecanismo
 * curou o elemento certo". Sem ela, a análise classifica a cura como correta
 * apenas quando o teste passa, o que é uma Inferência e não uma medição.
 *
 * Formato de `dados/revisao-manual.json`:
 *   { "M3-trat-r1": "errado", "M1-trat-r1": "correto" }
 *
 * @returns {Object} Mapa célula → veredito
 */
function lerRevisao() {
  const arquivo = path.join(DIR_ANALISE, "revisao-manual.json");
  if (!fs.existsSync(arquivo)) return {};
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    console.error(
      "Aviso: revisao-manual.json ilegível; usando inferência pelo resultado do teste.",
    );
    return {};
  }
}

/**
 * Monta os indicadores por mutação.
 * @param {Object[]} registros - Registros coletados
 * @returns {Object[]} Indicadores
 */
function consolidar(registros) {
  const revisao = lerRevisao();
  const reparo = lerReparoManual();
  const porMutacao = new Map();

  for (const registro of registros) {
    const chave = registro.mutacao ?? "baseline";

    if (!porMutacao.has(chave)) {
      porMutacao.set(chave, []);
    }
    porMutacao.get(chave).push(registro);
  }

  const linhas = [];

  for (const mutacao of MUTACOES) {
    const execucoes = porMutacao.get(mutacao.id) ?? [];
    const tratamento = execucoes.filter((e) => e.config === "tratamento" && e.tau === TAU_PADRAO);
    const controle = execucoes.filter((e) => e.config === "controle");
    const sensibilidade = execucoes.filter((e) => e.grupo === "sensibilidade");

    const curas = tratamento.map((e) => {
      const cura = extrairCura(lerRelatorioCura(e.celula));
      const veredito = revisao[e.celula] ?? null;

      return {
        celula: e.celula,
        passou: passouSpec(e),
        curou: cura.curou,
        score: cura.score,
        reasons: cura.reasons,
        seletorCurado: cura.seletorCurado,
        revisaoHumana: veredito,
        // Com revisão humana, o veredito prevailce. Sem ela, a inferência é
        // "a cura é correta quando o teste passa" (marcada como provisória).
        curaCorreta: veredito ? veredito === "correto" : cura.curou && passouSpec(e),
        // Mutação que o seletor de referência não enxerga: nada quebrou, logo
        // não houve o que curar. Não é acerto nem erro do mecanismo, e por isso
        // fica fora das taxas em vez de contar como verdadeiro positivo.
        semEfeito: veredito === "sem-efeito",
        // O mecanismo se recusou a curar uma mutação que não era curável, e o
        // teste continuou falhando. É o comportamento desejado, não um erro.
        recusaCorreta: veredito === "recusa-correta",
        classificacaoProvisoria: !veredito,
      };
    });

    const semEfeito = curas.filter((c) => c.semEfeito);
    const avaliadas = curas.filter((c) => !c.semEfeito);
    const comCura = avaliadas.filter((c) => c.curaCorreta).length;
    const comFalsoPositivo = avaliadas.filter((c) => c.curou && !c.curaCorreta).length;
    const semFalsoPositivo =
      comFalsoPositivo + avaliadas.filter((c) => c.recusaCorreta || (!c.curou && !c.passou)).length;

    linhas.push({
      mutacao: mutacao.id,
      nome: mutacao.nome,
      categoria: mutacao.categoria,
      descricao: mutacao.descricao,
      portador: mutacao.portador,
      alvo: mutacao.alvo.descricao,
      scorePrevisto: mutacao.scorePrevisto,
      curaPrevista: mutacao.curaPrevista,
      falsoPositivoPrevisto: !!mutacao.falsoPositivoPrevisto,
      n: tratamento.length,
      nSemEfeito: semEfeito.length,
      curas: comCura,
      falhas: avaliadas.length - comCura,
      falsosPositivos: comFalsoPositivo,
      falhasLegitimas: semFalsoPositivo,
      execucoes: curas,
      scoreMedio: (() => {
        const comScore = curas.filter((c) => c.score !== null);
        if (comScore.length === 0) return null;
        return comScore.reduce((s, c) => s + c.score, 0) / comScore.length;
      })(),
      recusaCorreta: avaliadas.filter((c) => c.recusaCorreta).length,
      revisaoCompleta: curas.every((c) => !c.classificacaoProvisoria),
      controle: controle[0]
        ? {
            passou: passouSpec(controle[0]),
            duracaoMs: controle[0].duracaoMs ?? null,
            tempoReparoMin: reparo[controle[0].celula]?.minutos ?? null,
            seletoresAlterados: reparo[controle[0].celula]?.seletoresAlterados ?? null,
          }
        : null,
      entradasHistorico: tratamento.map((e) => e.entradasHistorico ?? null),
      sensibilidade: sensibilidade.map((e) => {
        const cura = extrairCura(lerRelatorioCura(e.celula));
        const veredito = revisao[e.celula] ?? null;

        return {
          celula: e.celula,
          tau: e.tau,
          passou: passouSpec(e),
          curou: cura.curou,
          score: cura.score,
          curaCorreta: veredito ? veredito === "correto" : cura.curou && passouSpec(e),
        };
      }),
    });
  }

  return linhas;
}

/**
 * Calcula as métricas globais de precisão e recall das curas.
 * @param {Object[]} linhas - Indicadores por mutação
 * @returns {Object} Métricas globais
 */
function metricas(linhas) {
  const comDados = linhas.filter((l) => l.nSemEfeito === 0 && l.n > 0);
  const semEfeito = linhas.reduce((s, l) => s + (l.nSemEfeito ?? 0), 0);

  const tp = comDados.reduce((s, l) => s + l.curas, 0);
  const fp = comDados.reduce((s, l) => s + l.falsosPositivos, 0);
  // Falso negativo: o mecanismo não curou quando a mutação era curável
  // (M1, M2 e M4 são curáveis; M5 é_recuperável_por_design).
  const curaveis = comDados.filter((l) => CURAVEIS.includes(l.mutacao));
  const fn = curaveis.reduce((s, l) => s + l.falhas, 0);

  const precisao = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const f1 =
    precisao !== null && recall !== null && precisao + recall > 0
      ? (2 * precisao * recall) / (precisao + recall)
      : null;

  const curadas = comDados.filter((l) => l.curas > 0).length;

  return {
    execucoes: comDados.reduce((s, l) => s + l.n, 0),
    execucoesSemEfeito: semEfeito,
    tp,
    fp,
    fn,
    precisao,
    recall,
    f1,
    taxaCura: comDados.length > 0 ? tp / comDados.reduce((s, l) => s + l.n, 0) : null,
    mutacoesCuradas: curadas,
    mutacoesTestadas: comDados.length,
  };
}

/**
 * Gera as tabelas em Markdown, numeradas como no Capítulo 5.
 * @param {Object[]} linhas - Indicadores por mutação
 * @param {Object} global - Métricas globais
 * @returns {string} Tabelas em Markdown
 */
function tabelas(linhas, global) {
  const pct = (v) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);
  const num = (v, d = 2) => (v === null || v === undefined ? "—" : v.toFixed(d));

  const quadroMutacoes = [
    "| Mutação | Categoria | Portador no app | Alvo | Score previsto | Cura prevista | Execuções | Curas | Score médio |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...linhas.map(
      (l) =>
        `| ${l.mutacao} | ${l.categoria} | ${l.portador} | ${l.alvo} | ${num(l.scorePrevisto)} | ` +
        `${l.curaPrevista ? "sim" : "não"} | ${l.n} | ${l.curas} | ${num(l.scoreMedio)} |`,
    ),
  ].join("\n");

  const quadroResultados = [
    "| Mutação | Hipótese | Curas corretas | Falsos positivos | Recusa correta | Sem efeito | Reparo manual (min) | Seletores alterados |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...linhas.map(
      (l) =>
        `| ${l.mutacao} | ${l.curaPrevista ? "cura" : "não cura"}` +
        `${l.falsoPositivoPrevisto ? " (FP)" : ""} | ` +
        `${l.curas}/${l.n} | ${l.falsosPositivos > 0 ? `${l.falsosPositivos} ocorrência(s)` : "não"} | ` +
        `${l.recusaCorreta > 0 ? `${l.recusaCorreta} ocorrência(s)` : "não"} | ` +
        `${l.nSemEfeito > 0 ? `${l.nSemEfeito} execução(ões)` : "não"} | ` +
        `${l.controle?.tempoReparoMin ?? "—"} | ${l.controle?.seletoresAlterados ?? "—"} |`,
    ),
  ].join("\n");

  // Comparação entre a hipótese pré-registrada e o que o aparelho mostrou.
  // Divergências são resultado do experimento, não erro: são o objeto de
  // discussão do capítulo.
  const quadroPrevisao = [
    "| Mutação | Comportamento previsto | Comportamento observado | Confere? |",
    "| --- | --- | --- | --- |",
    ...linhas.map((l) => {
      let observado;
      if (l.nSemEfeito > 0) {
        observado = "seletor não afetado pela mutação";
      } else if (l.curas > 0) {
        observado = `curou o elemento certo (score ${num(l.scoreMedio)})`;
      } else if (l.falsosPositivos > 0) {
        observado = `curou o elemento errado (${l.falsosPositivos}x)`;
      } else if (l.recusaCorreta > 0) {
        observado = "recusou curar";
      } else {
        observado = "não curou";
      }

      const previsto = l.curaPrevista
        ? "cura"
        : l.falsoPositivoPrevisto
          ? "falso positivo"
          : "recusa";
      const confere =
        (l.curaPrevista && l.curas > 0) ||
        (l.falsoPositivoPrevisto && l.falsosPositivos > 0) ||
        (!l.curaPrevista && !l.falsoPositivoPrevisto && l.curas === 0 && l.falsosPositivos === 0);

      return `| ${l.mutacao} | ${previsto} | ${observado} | ${confere ? "sim" : "não"} |`;
    }),
  ].join("\n");

  const linhasTau = linhas.filter((l) => l.sensibilidade.length > 0);
  const taus = [...new Set(linhasTau.flatMap((l) => l.sensibilidade.map((s) => s.tau)))].sort(
    (a, b) => a - b,
  );

  const quadroTau = [
    "| τ | Curas | Execuções | Taxa de cura | Falsos positivos |",
    "| --- | --- | --- | --- | --- |",
    ...taus.map((tau) => {
      const ex = linhasTau.flatMap((l) => l.sensibilidade.filter((s) => s.tau === tau));
      const curas = ex.filter((s) => s.curaCorreta).length;
      const fps = ex.filter((s) => s.curou && !s.curaCorreta).length;
      return `| ${tau.toFixed(2)} | ${curas} | ${ex.length} | ${pct(ex.length ? curas / ex.length : null)} | ${fps > 0 ? fps : "não"} |`;
    }),
  ].join("\n");

  const resumo = [
    `Execuções de tratamento analisadas: ${global.execucoes}`,
    `Taxa de cura: ${pct(global.taxaCura)}`,
    `Mutações curadas: ${global.mutacoesCuradas} de ${global.mutacoesTestadas}`,
    `Precisão: ${pct(global.precisao)} | Recall: ${pct(global.recall)} | F1: ${pct(global.f1)}`,
    `Verdadeiros positivos: ${global.tp} | Falsos positivos: ${global.fp} | Falsos negativos: ${global.fn}`,
  ].join("\n");

  return `# Resultados do experimento — tabelas do Capítulo 5

${resumo}

## Quadro 12 — Mutações de interface aplicadas ao sujeito

${quadroMutacoes}

## Quadro 13 — Resultados por mutação e custo de manutenção

${quadroResultados}

## Quadro 14 — Hipótese pré-registrada × comportamento observado

${quadroPrevisao}

## Sensibilidade ao limiar de aceitação

${quadroTau}
`;
}

const registros = lerResultados();
const linhas = consolidar(registros);
const global = metricas(linhas);

const previsto = gerarMatriz().length;
const markdown = tabelas(linhas, global);

fs.mkdirSync(DIR_ANALISE, { recursive: true });
fs.writeFileSync(
  path.join(DIR_ANALISE, "resultados.json"),
  JSON.stringify({ metricas: global, porMutacao: linhas }, null, 2),
  "utf8",
);
fs.writeFileSync(path.join(DIR_ANALISE, "tabelas.md"), markdown, "utf8");

console.log(markdown);
console.log(`\nMatriz pré-registrada: ${previsto} células | executadas: ${registros.length}`);
console.log(
  `Arquivos: ${path.join(DIR_ANALISE, "resultados.json")}, ${path.join(DIR_ANALISE, "tabelas.md")}`,
);
