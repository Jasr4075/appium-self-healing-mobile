/**
 * Módulo de Análise de Seletores
 *
 * Responsável por obter e analisar a hierarquia de elementos da tela,
 * extraindo informações relevantes para o processo de self-healing.
 */

import healingLogger from "./healing-logger.js";

class SelectorAnalyzer {
  constructor() {
    this.driver = null;
  }

  /**
   * Define a instância do driver
   * @param {Object} driver - Instância do WebdriverIO
   */
  setDriver(driver) {
    this.driver = driver;
  }

  /**
   * Obtém todos os elementos visíveis na tela atual
   * @returns {Promise<Array>} Lista de elementos normalizados
   */
  async getScreenElements() {
    if (!this.driver) {
      throw new Error("Driver não foi configurado. Use setDriver() primeiro.");
    }

    healingLogger.logDebug("Obtendo hierarquia da tela...");

    try {
      // Obtém o page source do Appium
      const pageSource = await this.driver.getPageSource();

      // Extrai elementos da hierarquia XML
      const elements = this.parsePageSource(pageSource);

      healingLogger.logDebug(`${elements.length} elementos encontrados na tela`);

      return elements;
    } catch (error) {
      healingLogger.logDebug(`Erro ao obter elementos da tela: ${error.message}`);
      throw error;
    }
  }

  /**
   * Faz parse do XML do page source e extrai elementos
   * @param {string} xml - XML do page source
   * @returns {Array} Lista de elementos normalizados
   */
  parsePageSource(xml) {
    const elements = [];

    // Regex para capturar elementos e seus atributos
    const elementRegex = /<([^\s>]+)([^>]*)>/g;
    let match;
    let index = 0;

    while ((match = elementRegex.exec(xml)) !== null) {
      const tagName = match[1];
      const attributesStr = match[2];

      // Ignora tags de fechamento e hierarquia
      if (tagName.startsWith("/") || tagName === "hierarchy") {
        continue;
      }

      // Extrai atributos
      const element = this.extractAttributes(tagName, attributesStr, index);

      // Apenas adiciona se for um elemento relevante
      if (this.isRelevantElement(element)) {
        elements.push(element);
        index++;
      }
    }

    return elements;
  }

  /**
   * Extrai atributos de um elemento XML
   * @param {string} tagName - Nome da tag
   * @param {string} attributesStr - String com atributos
   * @param {number} index - Índice do elemento
   * @returns {Object} Elemento normalizado
   */
  extractAttributes(tagName, attributesStr, index) {
    const element = {
      class: tagName,
      id: null,
      text: null,
      contentDesc: null,
      clickable: false,
      enabled: false,
      index: index,
      bounds: null,
    };

    // Extrai resource-id
    const idMatch = attributesStr.match(/resource-id="([^"]*)"/);
    if (idMatch && idMatch[1]) {
      element.id = idMatch[1];
    }

    // Extrai text
    const textMatch = attributesStr.match(/text="([^"]*)"/);
    if (textMatch && textMatch[1]) {
      element.text = textMatch[1];
    }

    // Extrai content-desc
    const descMatch = attributesStr.match(/content-desc="([^"]*)"/);
    if (descMatch && descMatch[1]) {
      element.contentDesc = descMatch[1];
    }

    // Extrai clickable
    const clickableMatch = attributesStr.match(/clickable="([^"]*)"/);
    if (clickableMatch) {
      element.clickable = clickableMatch[1] === "true";
    }

    // Extrai enabled
    const enabledMatch = attributesStr.match(/enabled="([^"]*)"/);
    if (enabledMatch) {
      element.enabled = enabledMatch[1] === "true";
    }

    // Extrai bounds
    const boundsMatch = attributesStr.match(/bounds="([^"]*)"/);
    if (boundsMatch) {
      element.bounds = boundsMatch[1];
    }

    return element;
  }

  /**
   * Verifica se um elemento é visível na tela
   * @param {string} bounds - Bounds do elemento no formato [x1,y1][x2,y2]
   * @returns {boolean} Se está visível
   */
  isVisible(bounds) {
    if (!bounds) return false;

    // Parse: [x1,y1][x2,y2]
    const match = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return false;

    const [, x1, y1, x2, y2] = match.map(Number);

    // Verifica se tem área visível (largura e altura > 0)
    const width = x2 - x1;
    const height = y2 - y1;

    return width > 0 && height > 0 && x1 >= 0 && y1 >= 0;
  }

  /**
   * Verifica se um elemento é relevante para análise
   * @param {Object} element - Elemento a ser verificado
   * @returns {boolean} Se é relevante
   */
  isRelevantElement(element) {
    // Ignora elementos sem identificadores
    if (!element.id && !element.text && !element.contentDesc) {
      return false;
    }

    // Ignora elementos não interativos (pode ser ajustado)
    if (!element.clickable && !element.enabled) {
      return false;
    }

    // Ignora alguns tipos de elementos irrelevantes
    const irrelevantClasses = [
      "android.view.ViewGroup",
      "android.widget.LinearLayout",
      "android.widget.RelativeLayout",
      "android.widget.FrameLayout",
    ];

    if (irrelevantClasses.includes(element.class)) {
      // Apenas mantém se tiver ID ou texto
      return !!(element.id || element.text);
    }

    return true;
  }

  /**
   * Busca elementos similares baseado em critérios
   * @param {Object} criteria - Critérios de busca
   * @returns {Promise<Array>} Elementos que correspondem aos critérios
   */
  async findSimilarElements(criteria) {
    const allElements = await this.getScreenElements();

    return allElements.filter((element) => {
      let match = true;

      if (criteria.class && element.class !== criteria.class) {
        match = false;
      }

      if (criteria.id && !element.id.includes(criteria.id)) {
        match = false;
      }

      if (criteria.text && !element.text.includes(criteria.text)) {
        match = false;
      }

      return match;
    });
  }

  /**
   * Cria um seletor WebdriverIO a partir de um elemento
   * @param {Object} element - Elemento normalizado
   * @returns {string} Seletor WDIO
   */
  createSelector(element) {
    // Prioridade: ID > Content-Desc > Text > Class + Index

    if (element.id) {
      // Verifica se é um ID completo (com pacote) ou curto
      if (element.id.includes(":id/")) {
        return `android=new UiSelector().resourceId("${element.id}").instance(0)`;
      }
      return `android=new UiSelector().resourceIdMatches(".*${element.id}").instance(0)`;
    }

    if (element.contentDesc) {
      return `~${element.contentDesc}`;
    }

    if (element.text) {
      return `android=new UiSelector().text("${element.text}").instance(0)`;
    }

    // Fallback: usa classe + índice
    return `android=new UiSelector().className("${element.class}").instance(${element.index})`;
  }

  /**
   * Valida se um seletor está válido na tela atual
   * @param {string} selector - Seletor a ser validado
   * @returns {Promise<boolean>} Se o seletor é válido
   */
  async isValidSelector(selector) {
    try {
      const element = await this.driver.$(selector);
      return await element.isExisting();
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtém estatísticas da tela atual
   * @returns {Promise<Object>} Estatísticas
   */
  async getScreenStats() {
    const elements = await this.getScreenElements();

    return {
      totalElements: elements.length,
      clickableElements: elements.filter((e) => e.clickable).length,
      elementsWithId: elements.filter((e) => e.id).length,
      elementsWithText: elements.filter((e) => e.text).length,
      classes: [...new Set(elements.map((e) => e.class))],
    };
  }
}

// Exporta instância singleton
const instance = new SelectorAnalyzer();
export default instance;