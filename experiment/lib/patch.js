/**
 * Aplicação e reversão de patches no repositório do app sob ensaio.
 *
 * Regras de segurança aplicadas por todas as funções deste módulo:
 *  1. nenhuma edição é feita com o repositório em estado desconhecido: o
 *     commit e a limpeza da árvore são verificados antes e depois;
 *  2. toda edição exige ocorrência exata do trecho procurado, o que impede
 *     que uma mutação seja aplicada no lugar errado quando o app evolui;
 *  3. a reversão usa `git checkout --` apenas nos arquivos tocados pelo
 *     experimento, nunca em todo o repositório;
 *  4. nenhum commit é criado no repositório do app.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * Executa um comando no repositório do app.
 * @param {string} raiz - Raiz do repositório
 * @param {string[]} args - Argumentos do git
 * @returns {string} Saída padrão
 */
function git(raiz, args) {
  return execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8" }).trim();
}

/**
 * Lê o commit atual e confirma que a árvore tracked está limpa.
 * @param {string} raiz - Raiz do repositório
 * @returns {{commit: string, branch: string}}
 */
export function verificarArvore(raiz) {
  const sujo = git(raiz, ["status", "--porcelain", "--untracked-files=no"]);

  if (sujo) {
    throw new Error(
      `Árvore de trabalho do app com alterações rastreadas. Ensaio abortado para não\n` +
        `sobrescrever trabalho em andamento:\n${sujo}`,
    );
  }

  return {
    commit: git(raiz, ["rev-parse", "HEAD"]),
    branch: git(raiz, ["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

/**
 * Conta as ocorrências exatas de um trecho em um arquivo.
 * @param {string} arquivo - Caminho absoluto
 * @param {string} trecho - Trecho procurado
 * @returns {number} Quantidade de ocorrências
 */
function contar(arquivo, trecho) {
  const conteudo = fs.readFileSync(arquivo, "utf8");
  return conteudo.split(trecho).length - 1;
}

/**
 * Aplica as edições de um patch, exigindo match exato.
 * @param {string} raizApp - Raiz do repositório do app
 * @param {Object} patch - Patch com lista de edições
 * @returns {{arquivos: string[], edicoes: number}} Arquivos tocados e nº de edições
 */
export function aplicarPatch(raizApp, patch) {
  const arquivos = [];

  for (const edicao of patch.edicoes) {
    const arquivo = path.join(raizApp, edicao.arquivo);
    const esperado = edicao.ocorrencias ?? 1;

    if (!fs.existsSync(arquivo)) {
      throw new Error(`[${patch.id}] Arquivo não encontrado: ${edicao.arquivo}`);
    }

    const encontradas = contar(arquivo, edicao.de);

    if (encontradas !== esperado) {
      throw new Error(
        `[${patch.id}] Match exato falhou em ${edicao.arquivo}: esperado ${esperado}x, ` +
          `encontrado ${encontradas}x. O app foi alterado desde a última versão dos patches.`,
      );
    }

    const conteudo = fs.readFileSync(arquivo, "utf8");
    fs.writeFileSync(arquivo, conteudo.split(edicao.de).join(edicao.para), "utf8");
    arquivos.push(edicao.arquivo);
  }

  return { arquivos: [...new Set(arquivos)], edicoes: patch.edicoes.length };
}

/**
 * Reverte arquivos do app para o estado do commit.
 * @param {string} raizApp - Raiz do repositório do app
 * @param {string[]} arquivos - Caminhos relativos tocados
 */
export function reverterArquivos(raizApp, arquivos) {
  if (!arquivos || arquivos.length === 0) return;

  git(raizApp, ["checkout", "--", ...arquivos]);
}

/**
 * Restaura todos os arquivos rastreados do app ao estado do commit.
 *
 * É a restauração usada ao final de cada execução. Como `verificarArvore`
 * exige que a árvore esteja limpa ANTES de começar, qualquer arquivo
 * rastreado modificado ao final foi modificado pelo experimento, e portanto
 * pode ser restaurado com segurança. Arquivos não rastreados (build, logs,
 * .expo) não são afetados.
 *
 * @param {string} raizApp - Raiz do repositório do app
 * @returns {string[]} Arquivos que estavam modificados antes da restauração
 */
export function restaurarArvore(raizApp) {
  const modificados = git(raizApp, ["diff", "--name-only"]).split("\n").filter(Boolean);

  if (modificados.length > 0) {
    git(raizApp, ["checkout", "--", "."]);
  }

  return modificados;
}
