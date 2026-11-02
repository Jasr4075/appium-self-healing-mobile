/**
 * Caminhos e parâmetros do experimento do Capítulo 5.
 *
 * O experimento é composto por duas partes independentes:
 *  - o SUJEITO é o app iFiandi (repositório próprio, nunca é commitado);
 *  - o BANCO DE ENSAIO é esta suíte de automação (repositório do TCC).
 *
 * O harness vive dentro do repositório do TCC e apenas patches o repositório
 * do app durante a execução, sempre revertendo ao final.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Raiz da suíte de automação (repositório do TCC). */
export const RAIZ_TCC = path.resolve(aqui, "..", "..");

/** Raiz do experimento. */
export const RAIZ_EXPERIMENTO = path.resolve(aqui, "..");

/** Raiz do repositório do app iFiandi (sujeito). */
export const RAIZ_APP = process.env.IFIANDI_APP_PATH || "/home/usuario/Documentos/IFIANDI/iFiandi";

/** Pacote Android do app sob ensaio. */
export const PACOTE_APP = process.env.WDIO_APP_PACKAGE || "com.ifiandi.ifiandi";

/** Ferramenta adb (ajustar por env se não estiver no PATH). */
export const ADB = process.env.ADB_PATH || "adb";

/** Diretório de resultados brutos e tabelas prontas para o capítulo. */
export const DIR_DADOS = path.join(RAIZ_EXPERIMENTO, "dados");

/**
 * Diretório de artefatos por execução (relatório de cura, page source, logs).
 *
 * Fica dentro de `experimento/dados/` de propósito: `output/logs/` é gerenciado
 * pela suíte, que o apaga no início de cada sessão WDIO, e destruiria os
 * artefatos da célula que está sendo medida.
 */
export const DIR_LOG_EXPERIMENTO = path.join(DIR_DADOS, "logs");

/** Onde a biblioteca grava o relatório de cura. */
export const RELATORIO_CURA = path.join(
  RAIZ_TCC,
  "output",
  "logs",
  "self-healing",
  "healing-report.json",
);

/**
 * Histórico de seletores curados da biblioteca.
 *
 * O mecanismo reaproveita soluções já conhecidas. Em experimento isso é uma
 * variável de confusão: uma cura poderia ser atribuída ao reaproveitamento de
 * uma solução de outra célula. Por isso o histórico é zerado antes de cada
 * execução e o tamanho resultante é registrado como métrica.
 */
export const HISTORICO_CURA = path.join(
  RAIZ_TCC,
  "output",
  "logs",
  "self-healing",
  "selector-history.json",
);

/** Especificação usada como fluxo controlado da fase experimental. */
export const SPEC_EXPERIMENTO = "tests/specs/ifiandi/LoginEmail.spec.js";

/** Diretório android do app, usado na etapa de build. */
export const DIR_ANDROID_APP = path.join(RAIZ_APP, "android");

/**
 * APK gerado pelo build.
 *
 * O experimento usa o APK **release**, não o debug. O projeto é um
 * expo-dev-client: o APK debug não embute o bundle JavaScript e, ao ser
 * aberto, mostra a tela do Expo em vez do app. O release embute o bundle e abre
 * direto na tela de acesso, que é o que a automação precisa.
 */
export const APK_RELEASE = path.join(
  DIR_ANDROID_APP,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);

/** APK release, ou o debug se o release ainda não foi gerado. */
export function caminhoApk() {
  return fs.existsSync(APK_RELEASE) ? APK_RELEASE : APK_DEBUG;
}

/** APK debug, mantido para diagnóstico. */
export const APK_DEBUG = path.join(
  DIR_ANDROID_APP,
  "app",
  "build",
  "outputs",
  "apk",
  "debug",
  "app-debug.apk",
);
