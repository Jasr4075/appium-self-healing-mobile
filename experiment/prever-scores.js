/**
 * Oráculo de scores: simula o mecanismo de cura sobre o page source real.
 *
 * Reproduz, fora do dispositivo, o que o motor faria em cada mutação: aplica o
 * efeito da mutação sobre a lista de candidatos extraída de uma captura real do
 * iFiandi, calcula o score de cada candidato com o mesmo código da biblioteca
 * (`appium-self-healing-mobile`) e informa o melhor candidato, o score e se ele
 * corresponde ao elemento pretendido.
 *
 * Serve para três coisas:
 *  1. conferir, antes de gastar tempo de dispositivo, se as hipóteses
 *     pré-registradas em `patches/mutations.js` se confirmam;
 *  2. produzir a tabela de scores previstos do apêndice do Capítulo 5;
 *  3. definir os limiares de aceitação da matriz de sensibilidade de τ.
 *
 * Uso: node experimento/prever-scores.js [caminho/elements.json]
 */

import fs from "node:fs";
import path from "node:path";
import { similarityScore } from "appium-self-healing-mobile";
import { MUTACOES } from "./patches/mutations.js";

const DIR_CAPTURAS = path.resolve(
  process.cwd(),
  "output",
  "screen-capture",
  "run-2026-09-22T02-31-39-190Z",
  "LoginEmail_spec_js",
  "deve_autenticar_com_e-mail_senha_e_acessar_a_Home",
);

/**
 * Cada mutação é observada na tela em que a falha ocorre no fluxo real:
 * a alternância para e-mail acontece na tela de telefone (step-001), enquanto
 * o campo de e-mail e o botão de envio só existem na tela de e-mail (step-002).
 * @param {string} tela - Identificador do passo
 * @returns {string} Caminho do elements.json
 */
function capturaDaTela(tela) {
  return path.join(DIR_CAPTURAS, tela, "elements.json");
}

/**
 * Âncoras adicionadas pela instrumentação do sujeito (patch de baseline).
 * O page source capturado foi gerado com o app original, que não expõe
 * resource-id nesses elementos; por isso a simulação parte do page source
 * instrumentado, que é o estado real durante o experimento.
 */
export const ANCORAS = [
  { testID: "btn_auth_use_phone", contentDesc: "Entrar com telefone" },
  { testID: "btn_auth_use_email", contentDesc: "Entrar com e-mail" },
  { testID: "input_auth_email", contentDesc: "E-mail" },
  { testID: "input_auth_password", contentDesc: "Senha" },
  { testID: "btn_auth_signin", contentDesc: "Entrar" },
];

/**
 * Aplica a instrumentação do sujeito sobre os candidatos.
 * @param {Object[]} candidatos - Candidatos do page source original
 * @returns {Object[]} Candidatos instrumentados
 */
function instrumentar(candidatos) {
  return candidatos.map((c) => {
    const ancora = ANCORAS.find((a) => a.contentDesc === c.contentDesc);
    return ancora ? { ...c, id: `com.ifiandi.ifiandi:id/${ancora.testID}` } : c;
  });
}

/**
 * Efeitos de cada mutação sobre a lista de candidatos do page source.
 * Reproduzem, no nível dos atributos nativos, o que a mudança no app provoca.
 */
export const EFEITOS = {
  M1(alvo) {
    return (candidatos) =>
      candidatos.map((c) =>
        c.id && c.id.includes(alvo.resourceIdOriginal)
          ? { ...c, id: c.id.replace(alvo.resourceIdOriginal, "btn_auth_submit") }
          : c,
      );
  },

  M2(alvo) {
    return (candidatos) =>
      candidatos.map((c) =>
        c.contentDesc === alvo.contentDesc
          ? { ...c, contentDesc: "E-mail de acesso", text: "E-mail de acesso" }
          : c,
      );
  },

  M3(alvo) {
    return (candidatos) =>
      candidatos.map((c) =>
        c.id && c.id.includes(alvo.resourceIdOriginal) ? { ...c, id: null } : c,
      );
  },

  M4(alvo) {
    return (candidatos) => {
      const lista = [...candidatos];
      const a = lista.findIndex((c) => c.id && c.id.includes(alvo.resourceIdOriginal));
      const b = lista.findIndex(
        (c) => c.contentDesc === "Entrar com telefone" || c.contentDesc === "Entrar com e-mail",
      );
      if (a >= 0 && b >= 0 && a !== b) {
        [lista[a], lista[b]] = [lista[b], lista[a]];
      }
      return lista;
    };
  },

  M5() {
    return (candidatos) =>
      candidatos.map((c) =>
        c.class === "android.widget.Button" ? { ...c, class: "android.view.ViewGroup" } : c,
      );
  },

  M6(alvo) {
    return (candidatos) => candidatos.filter((c) => c.contentDesc !== alvo.contentDesc);
  },
};

/**
 * Converte a captura em candidatos no formato esperado pelo cálculo de score.
 * @param {Object[]} elementos - Elementos do elements.json
 * @returns {Object[]} Candidatos
 */
function paraCandidatos(elementos) {
  return elementos.map((e, indice) => ({
    class: e.class,
    id: e["resource-id"] || null,
    text: e.text || null,
    contentDesc: e["content-desc"] || null,
    clickable: e.clickable,
    enabled: e.enabled,
    index: indice,
    bounds: e.bounds,
  }));
}

/**
 * Monta o seletor de referência exatamente como a suíte o declara.
 * @param {Object} alvo - Alvo da mutação
 * @returns {string} Seletor de referência
 */
function seletorReferencia(alvo) {
  return (
    "android=new UiSelector()" +
    `.className("${alvo.className}")` +
    `.resourceId("com.ifiandi.ifiandi:id/${alvo.resourceIdOriginal}")` +
    `.description("${alvo.contentDesc}")`
  );
}

/**
 * Executa a simulação de uma mutação em um limiar.
 * @param {Object} mutacao - Mutação
 * @param {Object[]} base - Candidatos originais
 * @param {number} tau - Limiar de aceitação
 * @returns {Object} Resultado da simulação
 */
export function simular(mutacao, base, tau) {
  process.env.HEALING_MIN_THRESHOLD = String(tau);

  const candidatos = EFEITOS[mutacao.id](mutacao.alvo)(instrumentar(base));
  const referencia = seletorReferencia(mutacao.alvo);

  const avaliados = candidatos
    .map((c) => ({ ...c, ...similarityScore.calculate(referencia, c) }))
    .sort((a, b) => b.score - a.score);

  const melhor = avaliados[0];
  const empate = avaliados.filter((c) => c.score === melhor.score).length;

  const ehAlvo =
    !!melhor &&
    ((melhor.id && melhor.id.includes(mutacao.alvo.resourceIdOriginal)) ||
      melhor.contentDesc === mutacao.alvo.contentDesc);

  return {
    mutacao: mutacao.id,
    tau,
    score: melhor ? melhor.score : 0,
    reasons: melhor ? melhor.reasons : [],
    aceito: !!melhor && melhor.score >= tau,
    ambiguo: empate > 1,
    alvoEncontrado: ehAlvo,
    falsoPositivo: !!melhor && melhor.score >= tau && !ehAlvo,
    rotuloCandidato: melhor ? melhor.contentDesc || melhor.text || "(sem rótulo)" : "(nenhum)",
    classCandidato: melhor ? melhor.class : "-",
  };
}

// Execução direta: imprime a tabela de previsões.
if (process.argv[1] && process.argv[1].endsWith("prever-scores.js")) {
  const arquivo = process.argv[2] || capturaDaTela("step-002");

  if (!fs.existsSync(arquivo)) {
    console.error(`Captura não encontrada: ${arquivo}`);
    process.exit(1);
  }

  const taus = [0.6, 0.7, 0.8, 0.9];
  const capturas = new Map();

  console.log(`Capturas de referência: ${DIR_CAPTURAS}`);
  console.log("\nmut  τ      score  aceito  ambiguo  FP    reasons                     candidato");

  const linhas = [];

  for (const mutacao of MUTACOES) {
    const arquivoMutacao = mutacao.tela ? capturaDaTela(mutacao.tela) : arquivo;

    if (!capturas.has(arquivoMutacao)) {
      capturas.set(
        arquivoMutacao,
        instrumentar(paraCandidatos(JSON.parse(fs.readFileSync(arquivoMutacao, "utf8")).elements)),
      );
    }
    const base = capturas.get(arquivoMutacao);
    console.log(`\n${mutacao.id} — ${mutacao.nome} (tela ${mutacao.tela})`);

    for (const tau of taus) {
      const r = simular(mutacao, base, tau);
      linhas.push({
        ...r,
        previsto: mutacao.scorePrevisto,
        curaPrevista: mutacao.curaPrevista,
        falsoPositivoPrevisto: !!mutacao.falsoPositivoPrevisto,
      });
      console.log(
        `${r.mutacao.padEnd(4)} ${tau.toFixed(2)}  ${r.score.toFixed(2).padStart(5)}  ` +
          `${String(r.aceito).padEnd(6)}  ${String(r.ambiguo).padEnd(7)}  ` +
          `${String(r.falsoPositivo).padEnd(4)}  ${r.reasons.join(",").padEnd(25)}  ` +
          `${r.classCandidato} ${r.rotuloCandidato}`,
      );
    }
    console.log("");
  }

  // A previsão é comparada com a simulação em três dimensões: score do melhor
  // candidato, ativação do elemento correto e produção de falso positivo.
  // A hipótese pré-registrada se refere ao limiar padrão (τ = 0,70). Os demais
  // limiares não são verificação, e sim o resultado da análise de sensibilidade.
  const divergentes = linhas.filter(
    (l) =>
      l.tau === 0.7 &&
      (Math.abs(l.score - l.previsto) > 0.01 ||
        l.curaPrevista !== (l.aceito && l.alvoEncontrado) ||
        l.falsoPositivoPrevisto !== l.falsoPositivo),
  );

  if (divergentes.length > 0) {
    console.log("Divergências entre hipótese pré-registrada e simulação analítica:");
    for (const d of divergentes) {
      console.log(
        `  ${d.mutacao} @ τ=${d.tau.toFixed(2)}: previsto ${d.previsto.toFixed(2)} ` +
          `/ cura=${d.curaPrevista} / FP=${d.falsoPositivoPrevisto} → simulado ` +
          `${d.score.toFixed(2)} / cura=${d.aceito && d.alvoEncontrado} / FP=${d.falsoPositivo}`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log("Todas as hipóteses pré-registradas foram confirmadas na simulação analítica.");
  }
}
