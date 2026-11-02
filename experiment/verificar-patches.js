/**
 * Verificação de aplicação e reversão dos patches, sem build, sem dispositivo.
 *
 * Confere, para cada mutação, que:
 *  1. a árvore do app está limpa antes de começar;
 *  2. a instrumentação aplica com match exato;
 *  3. a mutação aplica sobre a instrumentação;
 *  4. o diff resultante contém exatamente o esperado;
 *  5. a reversão devolve o app ao estado original.
 *
 * Uso: node experimento/verificar-patches.js
 */

import { patchBaseline } from "./patches/baseline.js";
import { MUTACOES } from "./patches/mutations.js";
import { aplicarPatch, restaurarArvore, verificarArvore } from "./lib/patch.js";
import { RAIZ_APP } from "./lib/paths.js";

let falhas = 0;

/**
 * Executa a verificação de um patch (instrumentação + mutação opcional).
 * @param {Object} patch - Patch a verificar
 */
function verificar(patch) {
  const arquivos = [];

  try {
    verificarArvore(RAIZ_APP);
    const base = aplicarPatch(RAIZ_APP, patchBaseline());
    arquivos.push(...base.arquivos);

    if (patch) {
      const mut = aplicarPatch(RAIZ_APP, patch);
      arquivos.push(...mut.arquivos);
    }

    console.log(`  ✓ ${(patch ? patch.id : "baseline").padEnd(9)} aplicou sem erro`);
  } catch (erro) {
    falhas++;
    console.log(`  ✗ ${(patch ? patch.id : "baseline").padEnd(9)} ${erro.message}`);
  } finally {
    try {
      const restaurados = restaurarArvore(RAIZ_APP);
      verificarArvore(RAIZ_APP);
      console.log(`  ✓ app restaurado (${restaurados.length} arquivo(s))`);
    } catch (erro) {
      falhas++;
      console.log(`  ✗ FALHA AO REVERTER: ${erro.message}`);
    }
  }
}

console.log(`Repositório do app: ${RAIZ_APP}\n`);

console.log("Instrumentação do sujeito:");
verificar(null);

for (const mutacao of MUTACOES) {
  console.log(`\n${mutacao.id} — ${mutacao.nome}`);
  console.log(`     portador: ${mutacao.portador} | score previsto: ${mutacao.scorePrevisto}`);
  verificar(mutacao);
}

console.log(
  falhas === 0
    ? "\nTodas as verificações passaram."
    : `\n${falhas} falha(s). Não iniciar a execução experimental.`,
);

process.exit(falhas === 0 ? 0 : 1);
