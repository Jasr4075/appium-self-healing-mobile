/**
 * Vigia do repositório do sujeito.
 *
 * O `run.js` reverte os patches em um bloco `finally`, o que não acontece se o
 * processo for encerrado à força (SIGKILL, queda de energia, fechamento do
 * terminal). Nesse caso o app ficaria com a instrumentação e a mutação
 * aplicadas, e a próxima execução abortaria por validação de árvore suja.
 *
 * Este vigia é um processo separado que observa o PID do runner e, assim que
 * ele deixa de existir, confere a árvore do app e a restaura se necessário.
 * É a única defesa possível contra morte por SIGKILL, e por isso roda
 * desacoplado do runner.
 *
 * Uso: node experimento/lib/vigilante.js <pidDoRunner> <log>
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { RAIZ_APP } from "./paths.js";

const [pidAlvo, arquivoLog] = process.argv.slice(2);
const INTERVALO_MS = 2000;

if (!pidAlvo) {
  console.error("Uso: node experimento/lib/vigilante.js <pidDoRunner> <log>");
  process.exit(1);
}

const registro = (mensagem) => {
  const linha = `[${new Date().toISOString()}] ${mensagem}\n`;
  if (arquivoLog) fs.appendFileSync(arquivoLog, linha, "utf8");
};

/**
 * Verifica se o processo indicado ainda existe.
 * @param {string} pid - PID
 * @returns {boolean} Verdadeiro se o processo existe
 */
function processoVivo(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (erro) {
    return erro.code === "EPERM";
  }
}

/**
 * Lista os arquivos rastreados modificados no app.
 * @returns {string[]} Caminhos modificados
 */
function modificados() {
  return execFileSync("git", ["diff", "--name-only"], {
    cwd: RAIZ_APP,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

/**
 * Espera de forma síncrona, sem laço de eventos e sem criar processos.
 * @param {number} ms - Milissegundos
 */
function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

registro(`vigia iniciado para o runner ${pidAlvo} (app: ${RAIZ_APP})`);

while (processoVivo(pidAlvo)) {
  esperar(INTERVALO_MS);
}

const sujos = modificados();

if (sujos.length === 0) {
  registro(`runner ${pidAlvo} encerrado; árvore do app já estava limpa`);
} else {
  registro(
    `runner ${pidAlvo} encerrado com ${sujos.length} arquivo(s) modificado(s): ${sujos.join(", ")}`,
  );
  execFileSync("git", ["checkout", "--", "."], { cwd: RAIZ_APP });

  const restantes = modificados();
  registro(
    restantes.length === 0
      ? "árvore do app restaurada ao commit"
      : `FALHA ao restaurar: ${restantes.join(", ")}`,
  );
}
