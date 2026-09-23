/**
 * Módulo de Logging para Self-Healing
 *
 * Responsável por registrar todas as ações de recuperação automática
 * de seletores, mantendo logs padronizados e claros.
 */

import fs from 'fs';
import path from 'path';

class HealingLogger {
  constructor() {
    // Remove o ensureLogDirectory() do construtor (criação lazy)
    this.logDir =
      process.env.HEALING_LOG_DIR || path.join(process.cwd(), 'output', 'logs', 'self-healing');
  }

  /**
   * Garante que o diretório de logs existe
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Registra uma tentativa de healing bem-sucedida
   * @param {Object} data - Dados da recuperação
   */
  logSuccess(data) {
    const { originalSelector, newSelector, score, reasons, spec } = data;
    const timestamp = new Date().toISOString();

    const message = [
      `[${timestamp}]`,
      `[SELF-HEALING SUCCESS]`,
      `Spec: ${spec}`,
      `Original: ${originalSelector}`,
      `New: ${newSelector}`,
      `Score: ${score.toFixed(2)}`,
      `Reasons: ${reasons.join(', ')}`,
    ].join(' | ');

    console.log(`✅ ${message}`);
    this.writeToFile(message);
  }

  /**
   * Registra uma tentativa de healing que falhou
   * @param {Object} data - Dados da tentativa
   */
  logFailure(data) {
    const { originalSelector, spec, reason } = data;
    const timestamp = new Date().toISOString();

    const message = [
      `[${timestamp}]`,
      `[SELF-HEALING FAILURE]`,
      `Spec: ${spec}`,
      `Original: ${originalSelector}`,
      `Reason: ${reason}`,
    ].join(' | ');

    console.log(`❌ ${message}`);
    this.writeToFile(message);
  }

  /**
   * Registra informações de debug
   * @param {string} message - Mensagem de debug
   */
  logDebug(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [DEBUG] ${message}`;

    if (process.env.HEALING_DEBUG === 'true') {
      console.log(`🔍 ${logMessage}`);
    }
    this.writeToFile(logMessage);
  }

  /**
   * Registra informações gerais
   * @param {string} message - Mensagem informativa
   */
  logInfo(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message}`;
    console.log(`ℹ️  ${logMessage}`);
    this.writeToFile(logMessage);
  }

  /**
   * Escreve mensagem no arquivo de log
   * @param {string} message - Mensagem a ser escrita
   */
  writeToFile(message) {
    try {
      this.ensureLogDirectory(); // Cria apenas no momento de escrever
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `healing-${date}.log`);
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (error) {
      console.error('Erro ao escrever log:', error.message);
    }
  }

  /**
   * Gera relatório resumido das ações de healing
   * @param {string} date - Data no formato YYYY-MM-DD
   * @returns {Object} Estatísticas do dia
   */
  generateReport(date = new Date().toISOString().split('T')[0]) {
    try {
      const logFile = path.join(this.logDir, `healing-${date}.log`);

      if (!fs.existsSync(logFile)) {
        return { success: 0, failure: 0, total: 0 };
      }

      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n');

      const stats = {
        success: lines.filter((line) => line.includes('[SELF-HEALING SUCCESS]')).length,
        failure: lines.filter((line) => line.includes('[SELF-HEALING FAILURE]')).length,
        total: 0,
      };

      stats.total = stats.success + stats.failure;
      stats.successRate =
        stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(2) + '%' : '0%';

      return stats;
    } catch (error) {
      this.logDebug(`Erro ao gerar relatório: ${error.message}`);
      return { success: 0, failure: 0, total: 0 };
    }
  }
}

// Exporta instância singleton
const instance = new HealingLogger();
export default instance;
