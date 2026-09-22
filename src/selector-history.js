/**
 * Módulo de Histórico de Seletores
 *
 * Gerencia a persistência e consulta de seletores recuperados pelo self-healing.
 * Mantém um histórico para auditoria e possível reutilização.
 */

import fs from "fs";
import path from "path";
import healingLogger from "./healing-logger.js";

class SelectorHistory {
  constructor() {
    // Apenas define o caminho padrão, sem acessar o disco no import
    this.historyFile =
      process.env.HEALING_HISTORY_PATH ||
      path.join(process.cwd(), "output", "logs", "self-healing", "selector-history.json");
    this.history = null; // Lazy load
    this.cache = new Map(); // Cache em memória para acesso rápido
  }

  /**
   * Garante que o diretório existe
   */
  ensureDirectory() {
    const dir = path.dirname(this.historyFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Carrega histórico do arquivo JSON
   * @returns {Array} Histórico carregado
   */
  loadHistory() {
    if (this.history) {
      return this.history;
    }

    this.ensureDirectory();

    if (!fs.existsSync(this.historyFile)) {
      this.buildCache();
      this.history = [];
      return this.history;
    }

    try {
      const data = fs.readFileSync(this.historyFile, "utf8");
      this.history = JSON.parse(data) || [];
      this.buildCache();
    } catch (error) {
      healingLogger.logDebug(`Erro ao carregar histórico: ${error.message}`);
      this.history = [];
    }

    return this.history;
  }

  /**
   * Salva histórico no arquivo JSON
   */
  saveHistory() {
    try {
      this.loadHistory();
      this.ensureDirectory();
      fs.writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2), "utf8");
    } catch (error) {
      healingLogger.logDebug(`Erro ao salvar histórico: ${error.message}`);
    }
  }

  /**
   * Constrói cache em memória para busca rápida
   */
  buildCache() {
    this.cache.clear();

    (this.history || []).forEach((entry) => {
      const key = this.generateKey(entry.originalSelector, entry.spec);
      this.cache.set(key, entry);
    });
  }

  /**
   * Gera chave única para cache
   * @param {string} selector - Seletor original
   * @param {string} spec - Nome do spec
   * @returns {string} Chave única
   */
  generateKey(selector, spec) {
    return `${spec}::${selector}`;
  }

  /**
   * Adiciona nova entrada no histórico
   * @param {Object} entry - Dados da recuperação
   */
  add(entry) {
    this.loadHistory();

    const record = {
      originalSelector: entry.originalSelector,
      newSelector: entry.newSelector,
      score: entry.score,
      reasons: entry.reasons,
      spec: entry.spec,
      timestamp: new Date().toISOString(),
      success: entry.success || true,
      context: entry.context || {},
    };

    this.history.push(record);

    // Atualiza cache
    const key = this.generateKey(record.originalSelector, record.spec);
    this.cache.set(key, record);

    // Salva no arquivo
    this.saveHistory();

    healingLogger.logDebug(`Histórico atualizado: ${this.history.length} entradas`);
  }

  /**
   * Busca seletor substituto no histórico
   * @param {string} originalSelector - Seletor que falhou
   * @param {string} spec - Nome do spec
   * @returns {Object|null} Entrada encontrada ou null
   */
  find(originalSelector, spec) {
    this.loadHistory();

    const key = this.generateKey(originalSelector, spec);
    return this.cache.get(key) || null;
  }

  /**
   * Busca entradas por spec
   * @param {string} spec - Nome do spec
   * @returns {Array} Entradas do spec
   */
  findBySpec(spec) {
    return this.loadHistory().filter((entry) => entry.spec === spec);
  }

  /**
   * Busca entradas por seletor original
   * @param {string} selector - Seletor original
   * @returns {Array} Entradas encontradas
   */
  findByOriginalSelector(selector) {
    return this.loadHistory().filter((entry) => entry.originalSelector === selector);
  }

  /**
   * Verifica se existe recuperação prévia
   * @param {string} selector - Seletor original
   * @param {string} spec - Nome do spec
   * @returns {boolean} Se existe
   */
  hasEntry(selector, spec) {
    return this.find(selector, spec) !== null;
  }

  /**
   * Obtém estatísticas do histórico
   * @returns {Object} Estatísticas
   */
  getStats() {
    const history = this.loadHistory();

    const successfulHealings = history.filter((e) => e.success).length;
    const uniqueSpecs = [...new Set(history.map((e) => e.spec))];
    const uniqueSelectors = [...new Set(history.map((e) => e.originalSelector))];

    // Calcula score médio
    const avgScore =
      history.length > 0
        ? history.reduce((sum, e) => sum + e.score, 0) / history.length
        : 0;

    // Identifica seletores mais problemáticos
    const selectorFrequency = {};
    history.forEach((entry) => {
      selectorFrequency[entry.originalSelector] =
        (selectorFrequency[entry.originalSelector] || 0) + 1;
    });

    const mostProblematic = Object.entries(selectorFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([selector, count]) => ({ selector, count }));

    return {
      totalEntries: history.length,
      successfulHealings,
      successRate:
        history.length > 0
          ? ((successfulHealings / history.length) * 100).toFixed(2) + "%"
          : "0%",
      uniqueSpecs: uniqueSpecs.length,
      uniqueSelectors: uniqueSelectors.length,
      averageScore: avgScore.toFixed(2),
      mostProblematic,
    };
  }

  /**
   * Limpa histórico antigo
   * @param {number} days - Número de dias para manter
   */
  cleanup(days = 30) {
    const history = this.loadHistory();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const initialLength = history.length;

    const filtered = history.filter((entry) => {
      const entryDate = new Date(entry.timestamp);
      return entryDate >= cutoffDate;
    });

    if (filtered.length < initialLength) {
      this.history = filtered;
      this.saveHistory();
      this.buildCache();

      const removed = initialLength - filtered.length;
      healingLogger.logInfo(`Limpeza do histórico: ${removed} entradas removidas`);
    }
  }

  /**
   * Exporta histórico para análise
   * @param {string} outputPath - Caminho do arquivo de saída
   */
  export(outputPath) {
    try {
      const stats = this.getStats();
      const exportData = {
        generatedAt: new Date().toISOString(),
        statistics: stats,
        entries: this.loadHistory(),
      };

      fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf8");

      healingLogger.logInfo(`Histórico exportado para: ${outputPath}`);
    } catch (error) {
      healingLogger.logDebug(`Erro ao exportar histórico: ${error.message}`);
    }
  }

  /**
   * Limpa todo o histórico (use com cuidado!)
   */
  clear() {
    this.history = [];
    this.cache.clear();
    this.saveHistory();
    healingLogger.logInfo("Histórico de self-healing limpo");
  }
}

// Exporta instância singleton
const instance = new SelectorHistory();
export default instance;