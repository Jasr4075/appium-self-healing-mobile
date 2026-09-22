/**
 * Módulo de Cálculo de Similaridade
 *
 * Calcula o score de similaridade entre um seletor original e um elemento candidato.
 * Usa pesos heurísticos para determinar a probabilidade de match correto.
 */

class SimilarityScore {
  /**
   * Retorna os pesos heurísticos (configuráveis via environment ou padrões).
   * Lidos sob demanda, sem efeitos colaterais no import da biblioteca.
   * @returns {Object} Pesos para class/text/id/position
   */
  getWeights() {
    const weights = {
      class: parseFloat(process.env.HEALING_WEIGHT_CLASS || "0.4"),
      text: parseFloat(process.env.HEALING_WEIGHT_TEXT || "0.3"),
      id: parseFloat(process.env.HEALING_WEIGHT_ID || "0.2"),
      position: parseFloat(process.env.HEALING_WEIGHT_POSITION || "0.1"),
    };

    // Validação: soma dos pesos deve ser aproximadamente 1.0
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(`[SELF-HEALING] ⚠️  Soma dos pesos = ${sum.toFixed(2)} (recomendado: 1.0)`);
    }

    return weights;
  }

  /**
   * Threshold mínimo para considerar um match válido (configurável via environment)
   * @returns {number} Valor entre 0 e 1
   */
  getMinThreshold() {
    // Aumentado de 0.5 para 0.70 para maior confiabilidade
    return parseFloat(process.env.HEALING_MIN_THRESHOLD || "0.70");
  }

  get MIN_THRESHOLD() {
    return this.getMinThreshold();
  }

  /**
   * Calcula score de similaridade entre seletor original e candidato
   * @param {string} originalSelector - Seletor que falhou
   * @param {Object} candidate - Elemento candidato
   * @param {number} originalIndex - Índice original (se conhecido)
   * @returns {Object} { score, reasons }
   */
  calculate(originalSelector, candidate, originalIndex = null) {
    const scores = {
      class: 0,
      text: 0,
      id: 0,
      position: 0,
    };
    const reasons = [];

    // Extrai informações do seletor original
    const selectorInfo = this.parseSelector(originalSelector);

    // Posição original: usa o índice explicitamente informado ou o extraído
    // do seletor (ex.: UiSelector().instance(n))
    const origIndex = originalIndex ?? selectorInfo.instance ?? null;

    // 1. Verifica similaridade de CLASS
    if (selectorInfo.class && candidate.class) {
      if (selectorInfo.class === candidate.class) {
        scores.class = 1.0;
        reasons.push("class-exact");
      } else if (this.isSimilarClass(selectorInfo.class, candidate.class)) {
        scores.class = 0.5;
        reasons.push("class-similar");
      }
    }

    // 2. Verifica similaridade de TEXTO
    if (selectorInfo.text && candidate.text) {
      const textScore = this.calculateTextSimilarity(selectorInfo.text, candidate.text);
      scores.text = textScore;

      if (textScore >= 0.9) {
        reasons.push("text-exact");
      } else if (textScore >= 0.6) {
        reasons.push("text-similar");
      }
    }

    // 3. Verifica similaridade de ID
    if (selectorInfo.id && candidate.id) {
      if (selectorInfo.id === candidate.id) {
        scores.id = 1.0;
        reasons.push("id-exact");
      } else if (this.isPartialMatch(selectorInfo.id, candidate.id)) {
        scores.id = 0.7;
        reasons.push("id-partial");
      }
    }

    // 4. Verifica proximidade de POSIÇÃO
    if (origIndex !== null && candidate.index !== undefined) {
      const positionScore = this.calculatePositionSimilarity(origIndex, candidate.index);
      scores.position = positionScore;

      if (positionScore >= 0.8) {
        reasons.push("position-close");
      }
    }

    // Calcula score final ponderado
    const weights = this.getWeights();
    const minThreshold = this.getMinThreshold();

    const finalScore =
      scores.class * weights.class +
      scores.text * weights.text +
      scores.id * weights.id +
      scores.position * weights.position;

    return {
      score: finalScore,
      reasons: reasons,
      breakdown: scores,
      isValid: finalScore >= minThreshold,
    };
  }

  /**
   * Extrai informações do seletor original
   * @param {string} selector - Seletor a ser analisado
   * @returns {Object} Informações extraídas
   */
  parseSelector(selector) {
    const info = {
      type: null,
      value: null,
      class: null,
      text: null,
      id: null,
      instance: null,
    };

    // Detecta tipo de seletor
    if (selector.startsWith("~")) {
      info.type = "accessibility";
      info.value = selector.substring(1);
    }
    // UiSelector format: android=new UiSelector().text("value")
    else if (selector.includes("UiSelector")) {
      // Extrai texto
      let textMatch = selector.match(/\.text\s*\(\s*["']([^"']+)["']\s*\)/);
      if (textMatch) {
        info.text = textMatch[1];
        info.type = "text";
      }

      // Extrai className
      let classMatch = selector.match(/\.className\s*\(\s*["']([^"']+)["']\s*\)/);
      if (classMatch) {
        info.class = classMatch[1];
      }

      // Extrai resourceId
      let idMatch = selector.match(/\.resourceId\s*\(\s*["']([^"']+)["']\s*\)/);
      if (idMatch) {
        info.id = idMatch[1];
        info.type = "id";
      }

      // Extrai instance (posição) quando presente
      let instMatch = selector.match(/\.instance\s*\(\s*(\d+)\s*\)/);
      if (instMatch) {
        info.instance = parseInt(instMatch[1], 10);
      }
    }
    // XPath format
    else if (selector.includes("resource-id")) {
      info.type = "id";
      const match = selector.match(/resource-id["\s]*[=:]["\s]*([^"'\]]+)/);
      info.id = match ? match[1] : null;
    } else if (selector.includes("@text")) {
      info.type = "text";
      const match = selector.match(/@text["\s]*[=:]["\s]*['"]([^"'\]]+)['"]/);
      info.text = match ? match[1] : null;
    } else if (selector.includes("android.widget")) {
      info.type = "class";
      const match = selector.match(/(android\.widget\.[A-Za-z]+)/);
      info.class = match ? match[1] : null;
    }

    return info;
  }

  /**
   * Verifica se duas classes são similares
   * @param {string} class1 - Primeira classe
   * @param {string} class2 - Segunda classe
   * @returns {boolean} Se são similares
   */
  isSimilarClass(class1, class2) {
    // Remove pacote e compara apenas o nome da classe
    const name1 = class1.split(".").pop();
    const name2 = class2.split(".").pop();

    // Verifica se são da mesma família (Button, TextView, etc)
    return name1 === name2 || name1.includes(name2) || name2.includes(name1);
  }

  /**
   * Calcula similaridade entre dois textos
   * @param {string} text1 - Primeiro texto
   * @param {string} text2 - Segundo texto
   * @returns {number} Score de 0 a 1
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const t1 = text1.toLowerCase().trim();
    const t2 = text2.toLowerCase().trim();

    // Match exato
    if (t1 === t2) return 1.0;

    // Contém (substring completo)
    if (t1.includes(t2) || t2.includes(t1)) return 0.9;

    // Prefixo comum longo (>= 50% do menor texto)
    const minLen = Math.min(t1.length, t2.length);
    let commonPrefixLen = 0;
    for (let i = 0; i < minLen; i++) {
      if (t1[i] === t2[i]) {
        commonPrefixLen++;
      } else {
        break;
      }
    }

    // Se compartilham pelo menos 50% do prefixo, considerar similaridade alta
    if (commonPrefixLen >= minLen * 0.5) {
      const prefixRatio = commonPrefixLen / Math.max(t1.length, t2.length);
      return Math.max(0.7, prefixRatio); // Mínimo 0.7 para prefixos longos
    }

    // Levenshtein simplificado (distância de edição)
    const maxLen = Math.max(t1.length, t2.length);
    const distance = this.levenshteinDistance(t1, t2);

    return Math.max(0, 1 - distance / maxLen);
  }

  /**
   * Calcula distância de Levenshtein entre duas strings
   * @param {string} s1 - String 1
   * @param {string} s2 - String 2
   * @returns {number} Distância
   */
  levenshteinDistance(s1, s2) {
    const matrix = [];

    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substituição
            matrix[i][j - 1] + 1, // inserção
            matrix[i - 1][j] + 1, // deleção
          );
        }
      }
    }

    return matrix[s2.length][s1.length];
  }

  /**
   * Verifica se há match parcial entre dois IDs
   * @param {string} id1 - ID 1
   * @param {string} id2 - ID 2
   * @returns {boolean} Se há match parcial
   */
  isPartialMatch(id1, id2) {
    if (!id1 || !id2) return false;

    const parts1 = id1.split(/[_/.:]/);
    const parts2 = id2.split(/[_/.:]/);

    // Verifica se alguma parte coincide
    return parts1.some((part1) => parts2.some((part2) => part1 === part2 && part1.length > 2));
  }

  /**
   * Calcula similaridade de posição
   * @param {number} index1 - Índice original
   * @param {number} index2 - Índice candidato
   * @returns {number} Score de 0 a 1
   */
  calculatePositionSimilarity(index1, index2) {
    const difference = Math.abs(index1 - index2);

    // Quanto menor a diferença, maior o score
    if (difference === 0) return 1.0;
    if (difference === 1) return 0.9;
    if (difference === 2) return 0.7;
    if (difference <= 5) return 0.5;

    return 0.2;
  }

  /**
   * Filtra candidatos válidos baseado no threshold
   * @param {Array} results - Lista de resultados com scores
   * @returns {Array} Candidatos acima do threshold
   */
  filterValidCandidates(results) {
    const minThreshold = this.getMinThreshold();

    return results
      .filter((result) => result.score >= minThreshold)
      .sort((a, b) => b.score - a.score);
  }
}

// Exporta instância singleton
const instance = new SimilarityScore();
export default instance;