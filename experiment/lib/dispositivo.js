/**
 * Operações de dispositivo e build do app sob ensaio.
 *
 * Todas as operações usam `execFileSync` com lista de argumentos, sem shell,
 * e validam o código de saída antes de prosseguir.
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { ADB, APK_RELEASE, DIR_ANDROID_APP, PACOTE_APP, RAIZ_TCC } from "./paths.js";

/**
 * Verifica se o adb está disponível e se o dispositivo está conectado.
 * @returns {{dispositivos: string[], ok: boolean}} Resultado da verificação
 */
export function verificarDispositivo() {
  const saida = execFileSync(ADB, ["devices"], { encoding: "utf8" });
  const dispositivos = saida
    .split("\n")
    .slice(1)
    .map((linha) => linha.trim())
    .filter((linha) => linha.endsWith("device"))
    .map((linha) => linha.split(/\s+/)[0]);

  return { dispositivos, ok: dispositivos.length > 0 };
}

/**
 * Remove as saídas de release para que o build repita o bundle.
 *
 * As mutações do experimento são mudanças de código JavaScript, e o APK release
 * precisa carregar o bundle correspondente. O bundle do APK vem da tarefa
 * `createBundleReleaseJsAndAssets` do plugin do Gradle do Expo, e essa tarefa
 * não considera o código JavaScript como entrada: mesmo com o fonte alterado,
 * ela é julgada atualizada e o APK continua sendo empacotado com o bundle
 * antigo. Apagar o bundle gerado e as saídas de release força a repetição,
 * preservando a compilação nativa, que é a parte cara do build.
 *
 * @returns {string[]} Diretórios removidos
 */
export function limparSaidasRelease() {
  const alvos = [
    path.join(
      DIR_ANDROID_APP,
      "app",
      "build",
      "generated",
      "assets",
      "createBundleReleaseJsAndAssets",
    ),
    path.join(DIR_ANDROID_APP, "app", "build", "intermediates", "assets", "release"),
    path.join(DIR_ANDROID_APP, "app", "build", "outputs", "apk", "release"),
  ];

  for (const alvo of alvos) {
    fs.rmSync(alvo, { recursive: true, force: true });
  }

  return alvos;
}

/**
 * Compila o APK do app instrumentado/mutado.
 *
 * Três ajustes são necessários neste ambiente e não são óbvios:
 *
 *  - `--offline`: as dependências do Gradle já estão em cache e a rede não está
 *    disponível; sem essa flag o build falha ao resolver dependências.
 *  - `-PreactNativeArchitectures`: compilar as quatro ABIs padrão leva muito
 *    mais tempo do que compilar apenas a do aparelho conectado.
 *  - saída capturada: sem isso, uma falha de build chega ao log como
 *    "Command failed" sem nenhuma pista do motivo.
 *
 * O APK precisa conter o bundle JavaScript. Um dev-client sem bundle abre a
 * tela do Expo em vez do app, e a automação cai em uma tela inesperada.
 *
 * @param {Object} [opcoes] - Opções
 * @param {boolean} [opcoes.silencioso] - Oculta o progresso do Gradle
 * @param {string} [opcoes.abi] - ABI do aparelho
 * @param {string[]} [opcoes.marcadores] - Literais que precisam estar no bundle
 * @returns {{caminho: string, bytes: number, sha256: string, bundleSha256: string}} APK gerado
 */
export function construirApk({ silencioso = true, abi = "arm64-v8a", marcadores = [] } = {}) {
  const argumentos = [
    "assembleRelease",
    "--offline",
    `--no-build-cache`,
    `-PreactNativeArchitectures=${abi}`,
  ];

  try {
    execFileSync("./gradlew", argumentos, {
      cwd: DIR_ANDROID_APP,
      stdio: silencioso ? "pipe" : "inherit",
      env: { ...process.env, CI: "1", NODE_ENV: "production" },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (erro) {
    const saida = `${erro.stdout ?? ""}\n${erro.stderr ?? ""}`;
    const linhas = saida.trim().split("\n").filter(Boolean);
    const resumo = linhas
      .filter((l) =>
        /what went wrong|caused by|^\s*(e: )?(FAILURE|Execution failed)|error:|SyntaxError/i.test(
          l,
        ),
      )
      .slice(-15);
    throw new Error(
      `Falha no build do APK (${argumentos.join(" ")}). Últimas linhas:\n` +
        (resumo.length > 0 ? resumo.join("\n") : linhas.slice(-15).join("\n")),
    );
  }

  if (!fs.existsSync(APK_RELEASE)) {
    throw new Error(`APK release não encontrado após o build: ${APK_RELEASE}`);
  }

  const apk = {
    caminho: APK_RELEASE,
    bytes: fs.statSync(APK_RELEASE).size,
    sha256: crypto.createHash("sha256").update(fs.readFileSync(APK_RELEASE)).digest("hex"),
  };

  apk.bundleSha256 = conferirBundleDoApk(apk, marcadores);

  return apk;
}

/**
 * Confere que o APK contém o bundle recém-gerado.
 *
 * Sem esta conferência, um build que reusa o bundle antigo passa despercebido e
 * a mutação jamais chega ao aparelho: a célula mediria o app sem a alteração,
 * e o resultado seria registrado como falha do mecanismo de cura.
 *
 * @param {Object} apk - APK gerado
 * @param {string[]} marcadores - Literais que precisam estar no bundle
 * @returns {string} SHA-256 do bundle dentro do APK
 */
function conferirBundleDoApk(apk, marcadores = []) {
  const gerado = path.join(
    DIR_ANDROID_APP,
    "app",
    "build",
    "generated",
    "assets",
    "createBundleReleaseJsAndAssets",
    "index.android.bundle",
  );

  if (!fs.existsSync(gerado)) {
    throw new Error(`Bundle não encontrado após o build: ${gerado}`);
  }

  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
  const conteudoGerado = fs.readFileSync(gerado);
  const hashGerado = hash(conteudoGerado);

  const noApk = execFileSync("unzip", ["-p", apk.caminho, "assets/index.android.bundle"], {
    maxBuffer: 128 * 1024 * 1024,
  });
  const hashApk = hash(noApk);

  if (hashGerado !== hashApk) {
    throw new Error(
      "O APK empacotado não contém o bundle recém-gerado. " +
        `bundle gerado ${hashGerado.slice(0, 12)}, bundle no APK ${hashApk.slice(0, 12)}. ` +
        "A mutação provavelmente não chegaria ao aparelho.",
    );
  }

  const ausentes = marcadores.filter((m) => !noApk.includes(Buffer.from(m, "utf8")));
  if (ausentes.length > 0) {
    throw new Error(
      `O bundle não contém os marcadores da célula: ${ausentes.join(", ")}. ` +
        "O APK está com o código anterior à instrumentação/mutação; " +
        "a célula mediria o app sem a alteração esperada.",
    );
  }

  return hashApk;
}

/**
 * Reinstala o app em estado limpo, para que cada execução comece do mesmo
 * ponto (tela de acesso, sem sessão anterior).
 * @param {string} apk - Caminho do APK
 */
export function reinstalarApp(apk) {
  execFileSync(ADB, ["uninstall", PACOTE_APP], { stdio: "ignore" });
  execFileSync(ADB, ["install", "-r", "-g", apk], { stdio: "inherit" });
}

/**
 * Coleta o page source atual, útil para anexar evidência de cada execução.
 * @param {string} destino - Arquivo de destino
 */
export function capturarPageSource(destino) {
  execFileSync(ADB, ["shell", "uiautomator", "dump", "/sdcard/window_dump.xml"], {
    stdio: "ignore",
  });
  execFileSync(ADB, ["pull", "/sdcard/window_dump.xml", destino], { stdio: "ignore" });
}

/**
 * Zera o estado de self-healing antes de cada execução.
 *
 * Sem isso, duas contaminação ocorrem:
 *  - o relatório de cura da célula anterior seria creditado à célula atual;
 *  - o histórico de seletores curados poderia satisfazer a busca sem que
 *    houvesse cálculo de similaridade, Tornando a cura um falso resultado.
 *
 * @param {string} relatorioCura - Caminho do relatório de cura
 * @param {string} historico - Caminho do histórico de seletores
 */
export function limparEstadoDeCura(relatorioCura, historico) {
  for (const arquivo of [relatorioCura, historico]) {
    if (fs.existsSync(arquivo)) fs.rmSync(arquivo);
  }
}

/**
/**
 * Arquiva o relatório de cura da célula.
 *
 * A biblioteca 1.1.0 não exporta `healing-report.json`: ela registra as
 * decisões em `output/logs/self-healing/healing-<data>.log`, um arquivo
 * compartilhado. Como a preparação da sessão WDIO limpa `output/logs`, o
 * arquivo contém apenas a célula atual, mas ele é destruído na célula
 * seguinte. Sem arquivar, a evidência de cura — qual elemento foi escolhido e
 * com que score — se perde, e a análise não tem como separar cura de falha.
 *
 * @param {string} destino - Diretório de artefatos da célula
 * @returns {Object} Relatório estruturado da célula
 */
export function arquivarRelatorioCura(destino) {
  const data = new Date().toISOString().split("T")[0];
  const origem = path.join(RAIZ_TCC, "output", "logs", "self-healing", `healing-${data}.log`);

  const relatorio = { entries: [] };

  if (fs.existsSync(origem)) {
    for (const linha of fs.readFileSync(origem, "utf8").split("\n")) {
      if (!linha.includes("[SELF-HEALING SUCCESS]") && !linha.includes("[SELF-HEALING FAILURE]")) {
        continue;
      }

      const sucesso = linha.includes("[SELF-HEALING SUCCESS]");
      relatorio.entries.push({
        success: sucesso,
        originalSelector: campo(linha, "Original"),
        newSelector: sucesso ? campo(linha, "New") : null,
        score: sucesso ? Number(campo(linha, "Score")) : null,
        reasons: sucesso ? campo(linha, "Reasons") : campo(linha, "Reason"),
      });
    }
  }

  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(
    path.join(destino, "healing-report.json"),
    JSON.stringify(relatorio, null, 2),
    "utf8",
  );

  return relatorio;
}

/**
 * Extrai o valor de um campo `| Campo: valor` de uma linha de log.
 * @param {string} linha - Linha do log
 * @param {string} nome - Nome do campo
 * @returns {string|null} Valor ou null
 */
function campo(linha, nome) {
  const achado = linha.match(new RegExp(`\\| ${nome}: ([^|]+)`));
  return achado ? achado[1].trim() : null;
}

/**
 * Conta as entradas do histórico de seletores curados.
 *
 * Mede o crescimento do conhecimento do mecanismo ao longo do experimento.
 *
 * @param {string} historico - Caminho do histórico de seletores
 * @returns {number} Quantidade de entradas
 */
export function contarHistorico(historico) {
  if (!fs.existsSync(historico)) return 0;

  try {
    const dados = JSON.parse(fs.readFileSync(historico, "utf8"));
    return Array.isArray(dados) ? dados.length : (dados.entries?.length ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Faz o Metro compilar o bundle antes de o app ser aberto.
 *
 * O app é um dev-client: ele não contém o bundle JavaScript e o busca no Metro
 * a cada inicialização. Compilar o bundle pela chamada HTTP antes de abrir o app
 * evita que o teste comece a interagir com a tela enquanto o bundle ainda está
 * sendo compilado, o que fazia a primeira busca de elemento falhar por tempo
 * insuficiente.
 *
 * Como cada mutação altera o código-fonte, o cache do Metro é invalidado a cada
 * célula; por isso o aquecimento é feito por célula, depois de aplicar os
 * patches. Também funciona como verificação de integridade: se o patch
 * quebrou o código, a resposta do Metro vem com erro em vez de JavaScript.
 *
 * @param {Object} [opcoes] - Opções
 * @param {number} [opcoes.porta] - Porta do Metro
 * @param {number} [opcoes.tentativas] - Tentativas em caso de falha
 * @returns {{ms: number, bytes: number}} Tempo e tamanho do bundle
 */
export async function aquecerBundle({ porta = 8081, tentativas = 3 } = {}) {
  const url = `http://localhost:${porta}/index.bundle?platform=android&dev=true&minify=false`;
  let ultimoErro;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const inicio = Date.now();

    try {
      const resposta = await fetch(url);
      const corpo = await resposta.text();

      if (!resposta.ok) {
        throw new Error(`Metro respondeu ${resposta.status}`);
      }

      // Erros de compilação vêm como JSON {"type":"TransformError",...}
      if (/^\s*\{/.test(corpo) && corpo.includes('"type"')) {
        const erro = JSON.parse(corpo);
        throw new Error(`Metro rejeitou o bundle: ${erro.type} — ${erro.message}`);
      }

      if (!corpo.includes("__BUNDLE_START_TIME__")) {
        throw new Error("resposta do Metro não é um bundle JavaScript");
      }

      return { ms: Date.now() - inicio, bytes: corpo.length };
    } catch (erro) {
      ultimoErro = erro;
    }
  }

  throw new Error(`Falha ao aquecer o bundle do Metro: ${ultimoErro?.message}`);
}
