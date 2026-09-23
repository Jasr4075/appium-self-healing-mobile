/**
 * Self-Healing Module - Entry Point
 *
 * Exporta todos os módulos do sistema de self-healing de forma organizada.
 */

import healingEngine from './healing-engine.js';
import selectorAnalyzer from './selector-analyzer.js';
import similarityScore from './similarity-score.js';
import selectorHistory from './selector-history.js';
import healingLogger from './healing-logger.js';

/**
 * Inicializa o sistema de self-healing
 * @param {Object} driver - Instância do WebdriverIO
 * @param {string} specName - Nome do spec
 * @param {Object} options - Opções de configuração
 */
function initialize(driver, specName, options = {}) {
  healingEngine.configure(driver, specName);

  if (options.enabled !== undefined) {
    healingEngine.setEnabled(options.enabled);
  }

  healingLogger.logInfo('Sistema de Self-Healing inicializado');
}

/**
 * Função helper para uso rápido
 * @param {Object} driver - Driver do WDIO
 * @param {string} selector - Seletor a buscar
 * @returns {Promise<Object>} Elemento encontrado
 */
async function find(driver, selector) {
  if (!healingEngine.driver) {
    healingEngine.configure(driver, 'default');
  }
  return await healingEngine.healingFind(selector);
}

// Exporta módulos e funções
export default {
  // Módulos principais
  healingEngine,
  selectorAnalyzer,
  similarityScore,
  selectorHistory,
  healingLogger,

  // Funções helpers
  initialize,
  find,

  // Atalhos para uso comum
  healingFind: (selector, options) => healingEngine.healingFind(selector, options),
  healingClick: (selector, options) => healingEngine.healingClick(selector, options),
  healingSetText: (selector, text, options) =>
    healingEngine.healingSetText(selector, text, options),
  healingGetText: (selector, options) => healingEngine.healingGetText(selector, options),

  // Utilidades
  getStats: () => healingEngine.getStats(),
  exportReport: (path) => healingEngine.exportReport(path),
  cleanup: (days) => healingEngine.cleanupHistory(days),
};

export {
  healingEngine,
  selectorAnalyzer,
  similarityScore,
  selectorHistory,
  healingLogger,
  initialize,
  find,
};

// Atalhos como named exports para consumo direto
export const healingFind = (selector, options) => healingEngine.healingFind(selector, options);
export const healingClick = (selector, options) => healingEngine.healingClick(selector, options);
export const healingSetText = (selector, text, options) =>
  healingEngine.healingSetText(selector, text, options);
export const healingGetText = (selector, options) =>
  healingEngine.healingGetText(selector, options);
