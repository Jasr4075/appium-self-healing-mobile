/**
 * Matriz de execução do experimento (desenho pré-registrado).
 *
 * O desenho é declarado em código para que o conjunto de células seja
 * reproduzível e para que a análise não possa ser enviesada por execuções
 * selecionadas: `analyze.js` processa exatamente as células previstas aqui.
 *
 * Configurações:
 *  - TRATAMENTO: self-healing ligado (SELF_HEALING_ENABLED=true);
 *  - CONTROLE: self-healing desligado, ou seja, reparo manual pelo autor.
 */

import { MUTACOES } from "../patches/mutations.js";

export const TRATAMENTO = "tratamento";
export const CONTROLE = "controle";

/** Limiar padrão do mecanismo. */
export const TAU_PADRAO = 0.7;

/**
 * Parâmetros do desenho.
 * @param {Object} opcoes - Ajustes da execução
 * @returns {Object} Parâmetros
 */
export function parametros(opcoes = {}) {
  return {
    repeticoes: Number(opcoes.repeticoes ?? 3),
    taus: (opcoes.taus ?? [TAU_PADRAO, 0.6, 0.8]).map(Number).sort((a, b) => a - b),
    mutacoes: opcoes.mutacoes ?? MUTACOES.map((m) => m.id),
    executarControle: opcoes.executarControle ?? true,
    executarSensibilidade: opcoes.executarSensibilidade ?? true,
    repeticoesBaseline: opcoes.repeticoesBaseline ?? 2,
  };
}

/**
 * Gera as células do experimento.
 *
 * Para cada mutação:
 *  - 3 repetições de tratamento em τ = 0,70 (medição principal da cura);
 *  - 1 execução de controle (reparo manual, sem self-healing);
 *  - 1 execução de tratamento em cada limiar adicional (sensibilidade de τ).
 * Além disso, 2 execuções de baseline, sem mutação, para verificar que o
 * fluxo controlado funciona antes e depois das alterações.
 *
 * @param {Object} opcoes - Ajustes da execução
 * @returns {Object[]} Lista de células
 */
export function gerarMatriz(opcoes = {}) {
  const p = parametros(opcoes);
  const celulas = [];

  for (let i = 1; i <= p.repeticoesBaseline; i++) {
    celulas.push({
      id: `baseline-r${i}`,
      mutacao: null,
      config: TRATAMENTO,
      repeticao: i,
      tau: TAU_PADRAO,
      grupo: "baseline",
    });
  }

  for (const mutacao of MUTACOES) {
    if (!p.mutacoes.includes(mutacao.id)) continue;

    for (let r = 1; r <= p.repeticoes; r++) {
      celulas.push({
        id: `${mutacao.id}-trat-r${r}`,
        mutacao: mutacao.id,
        config: TRATAMENTO,
        repeticao: r,
        tau: TAU_PADRAO,
        grupo: "cura",
      });
    }

    if (p.executarControle) {
      celulas.push({
        id: `${mutacao.id}-ctrl-r1`,
        mutacao: mutacao.id,
        config: CONTROLE,
        repeticao: 1,
        tau: null,
        grupo: "controle",
      });
    }

    if (p.executarSensibilidade) {
      for (const tau of p.taus.filter((t) => t !== TAU_PADRAO)) {
        celulas.push({
          id: `${mutacao.id}-tau${String(tau).replace(".", "")}`,
          mutacao: mutacao.id,
          config: TRATAMENTO,
          repeticao: 1,
          tau,
          grupo: "sensibilidade",
        });
      }
    }
  }

  return celulas;
}

/**
 * Conta quantos builds de APK a matriz exige, agrupando por conjunto de patches.
 * @param {Object[]} celulas - Células da matriz
 * @returns {number} Quantidade de builds
 */
export function contarBuilds(celulas) {
  const conjuntos = new Set(celulas.map((c) => c.mutacao ?? "baseline"));
  return conjuntos.size;
}
