/**
 * Módulo Principal - Self-Healing Engine
 *
 * Orquestra todo o processo de recuperação automática de seletores.
 * Este é o ponto de entrada para o sistema de self-healing.
 */

import healingLogger from './healing-logger.js';
import selectorAnalyzer from './selector-analyzer.js';
import selectorHistory from './selector-history.js';
import similarityScore from './similarity-score.js';

class HealingEngine {
  constructor() {
    this.driver = null;
    this.enabled = true;
    this.maxAttempts = 3;
    this.currentSpec = 'unknown';
  }

  /**
   * Configura o engine com driver e spec atual
   * @param {Object} driver - Instância do WebdriverIO
   * @param {string} specName - Nome do spec sendo executado
   */
  configure(driver, specName = 'unknown') {
    this.driver = driver;
    this.currentSpec = specName;
    selectorAnalyzer.setDriver(driver);
    healingLogger.logInfo(`Self-Healing configurado para spec: ${specName}`);
  }

  /**
   * Ativa/desativa o self-healing
   * @param {boolean} enabled - Estado desejado
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    healingLogger.logInfo(`Self-Healing ${enabled ? 'ativado' : 'desativado'}`);
  }

  /**
   * Função principal: busca elemento com self-healing
   * @param {string} selector - Seletor original
   * @param {Object} options - Opções adicionais
   * @returns {Promise<Object>} Elemento encontrado
   */
  async healingFind(selector, options = {}) {
    if (!this.driver) {
      throw new Error('HealingEngine não foi configurado. Use configure() primeiro.');
    }

    healingLogger.logDebug(`Tentando localizar: ${selector}`);

    try {
      // Primeira tentativa: busca normal
      const element = await this.driver.$(selector);
      const exists = await element.isExisting();

      if (exists) {
        healingLogger.logDebug(`Elemento encontrado normalmente: ${selector}`);
        return element;
      }

      // Se não existe e self-healing está desabilitado, lança erro
      if (!this.enabled) {
        throw new Error(`Elemento não encontrado: ${selector}`);
      }

      // Se falhou, tenta self-healing
      healingLogger.logInfo(`Elemento não encontrado. Iniciando self-healing para: ${selector}`);
      return await this.attemptHealing(selector, options);
    } catch (error) {
      // Evita tentativa duplicada quando o self-healing já falhou uma vez.
      if (error.message && error.message.includes('Self-Healing falhou para seletor')) {
        throw error;
      }

      // Se self-healing está desabilitado, relança erro
      if (!this.enabled) {
        throw error;
      }

      // Tenta self-healing
      healingLogger.logInfo(`Erro ao buscar elemento. Iniciando self-healing para: ${selector}`);
      return await this.attemptHealing(selector, options);
    }
  }

  /**
   * Tenta recuperar elemento usando self-healing
   * @param {string} originalSelector - Seletor que falhou
   * @param {Object} options - Opções adicionais
   * @returns {Promise<Object>} Elemento recuperado
   */
  async attemptHealing(originalSelector, options = {}) {
    try {
      // 1. Verifica se já existe solução conhecida no histórico
      const historicalMatch = selectorHistory.find(originalSelector, this.currentSpec);

      if (historicalMatch && options.useHistory !== false) {
        healingLogger.logDebug(`Solução encontrada no histórico: ${historicalMatch.newSelector}`);

        // Valida se o seletor histórico ainda funciona
        const isValid = await selectorAnalyzer.isValidSelector(historicalMatch.newSelector);

        if (isValid) {
          healingLogger.logSuccess({
            originalSelector,
            newSelector: historicalMatch.newSelector,
            score: historicalMatch.score,
            reasons: ['historical-match', ...historicalMatch.reasons],
            spec: this.currentSpec,
          });

          return await this.driver.$(historicalMatch.newSelector);
        }
      }

      // 2. Obtém todos os elementos da tela
      const screenElements = await selectorAnalyzer.getScreenElements();

      if (screenElements.length === 0) {
        throw new Error('Nenhum elemento encontrado na tela para análise');
      }

      healingLogger.logDebug(`Analisando ${screenElements.length} elementos da tela`);

      // 3. Calcula score de similaridade para cada candidato
      const candidates = screenElements.map((element, idx) => {
        const result = similarityScore.calculate(originalSelector, element);

        // Debug: mostra primeiros 5 candidatos
        if (idx < 5 && process.env.HEALING_DEBUG === 'true') {
          healingLogger.logDebug(
            `Candidato ${idx}: text="${element.text}", class="${element.class}", score=${result.score.toFixed(2)}`,
          );
        }

        return {
          element,
          ...result,
        };
      });

      // 4. Filtra candidatos válidos
      const validCandidates = similarityScore.filterValidCandidates(candidates);

      if (validCandidates.length === 0) {
        throw new Error('Nenhum candidato válido encontrado');
      }

      healingLogger.logDebug(`${validCandidates.length} candidatos válidos encontrados`);

      // 5. Seleciona melhor candidato
      const bestCandidate = validCandidates[0];
      healingLogger.logDebug(
        `Melhor candidato - Score: ${bestCandidate.score.toFixed(2)}, Razões: ${bestCandidate.reasons.join(', ')}`,
      );

      // 6. Cria novo seletor
      const newSelector = selectorAnalyzer.createSelector(bestCandidate.element);

      // 7. Valida novo seletor
      const isValid = await selectorAnalyzer.isValidSelector(newSelector);

      if (!isValid) {
        throw new Error('Seletor recuperado não é válido');
      }

      // 8. Registra sucesso
      const healingData = {
        originalSelector,
        newSelector,
        score: bestCandidate.score,
        reasons: bestCandidate.reasons,
        spec: this.currentSpec,
        success: true,
        context: {
          totalCandidates: screenElements.length,
          validCandidates: validCandidates.length,
          timestamp: new Date().toISOString(),
        },
      };

      selectorHistory.add(healingData);
      healingLogger.logSuccess(healingData);

      // 9. Retorna elemento recuperado
      return await this.driver.$(newSelector);
    } catch (error) {
      // Registra falha
      healingLogger.logFailure({
        originalSelector,
        spec: this.currentSpec,
        reason: error.message,
      });

      // Relança o erro original preservando a causa
      throw new Error(
        `Self-Healing falhou para seletor: ${originalSelector}. Erro: ${error.message}`,
        { cause: error },
      );
    }
  }

  /**
   * Wrapper para clique com self-healing
   * @param {string} selector - Seletor do elemento
   * @param {Object} options - Opções adicionais
   */
  async healingClick(selector, options = {}) {
    const element = await this.healingFind(selector, options);
    await element.click();
    healingLogger.logDebug(`Clique executado em: ${selector}`);
  }

  /**
   * Wrapper para setText com self-healing
   * @param {string} selector - Seletor do elemento
   * @param {string} text - Texto a ser inserido
   * @param {Object} options - Opções adicionais
   */
  async healingSetText(selector, text, options = {}) {
    const element = await this.healingFind(selector, options);
    await element.setValue(text);
    healingLogger.logDebug(`Texto inserido em: ${selector}`);
  }

  /**
   * Wrapper para getText com self-healing
   * @param {string} selector - Seletor do elemento
   * @param {Object} options - Opções adicionais
   * @returns {Promise<string>} Texto do elemento
   */
  async healingGetText(selector, options = {}) {
    const element = await this.healingFind(selector, options);
    const text = await element.getText();
    healingLogger.logDebug(`Texto obtido de: ${selector}`);
    return text;
  }

  /**
   * Wrapper para waitForExist com self-healing
   * @param {string} selector - Seletor do elemento
   * @param {number} timeout - Timeout em ms
   * @param {Object} options - Opções adicionais
   */
  async healingWaitForExist(selector, timeout = 10000, options = {}) {
    if (!this.driver) {
      throw new Error('HealingEngine não foi configurado. Use configure() primeiro.');
    }

    try {
      await this.driver.$(selector).waitForExist({ timeout });
    } catch {
      // Se falhou, tenta healing
      const element = await this.healingFind(selector, options);
      await element.waitForExist({ timeout: 5000 });
    }
  }

  /**
   * Obtém estatísticas do self-healing
   * @returns {Object} Estatísticas completas
   */
  getStats() {
    return {
      enabled: this.enabled,
      currentSpec: this.currentSpec,
      history: selectorHistory.getStats(),
    };
  }

  /**
   * Exporta relatório de self-healing
   * @param {string} outputPath - Caminho do arquivo de saída
   */
  exportReport(outputPath) {
    selectorHistory.export(outputPath);
  }

  /**
   * Limpa histórico antigo
   * @param {number} days - Dias para manter
   */
  cleanupHistory(days = 30) {
    selectorHistory.cleanup(days);
  }
}

// Exporta instância singleton
const instance = new HealingEngine();
export default instance;
