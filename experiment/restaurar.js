/**
 * Recupera o repositório do sujeito após uma execução interrompida.
 *
 * Se o processo de execução for interrompido entre a aplicação de um patch e a
 * reversão, o app fica com a instrumentação ou a mutação aplicada. Este script
 * devolve todo arquivo rastreado ao commit e confirma a limpeza.
 *
 * Uso:
 *   node experimento/restaurar.js
 *   node experimento/restaurar.js --verificar   # só confere, não altera
 */

import { restaurarArvore, verificarArvore } from "./lib/patch.js";
import { RAIZ_APP } from "./lib/paths.js";

const somenteVerificar = process.argv.includes("--verificar");

console.log(`Sujeito: ${RAIZ_APP}`);

if (somenteVerificar) {
  const estado = verificarArvore(RAIZ_APP);
  console.log(`Commit ${estado.commit.slice(0, 8)} (branch ${estado.branch}), árvore limpa.`);
  process.exit(0);
}

const restaurados = restaurarArvore(RAIZ_APP);

if (restaurados.length === 0) {
  console.log("Nada a restaurar: o app já estava limpo.");
} else {
  console.log(`Restaurados ${restaurados.length} arquivo(s):`);
  for (const arquivo of restaurados) {
    console.log(`  ${arquivo}`);
  }
}

const estado = verificarArvore(RAIZ_APP);
console.log(`Commit ${estado.commit.slice(0, 8)} (branch ${estado.branch}), árvore limpa.`);
