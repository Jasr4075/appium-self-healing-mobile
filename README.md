# ⚕️ Appium Mobile Self-Healing

> Um mecanismo inteligente de autocorreção de seletores (Self-Healing) baseado em heurísticas para testes E2E mobile com Appium e WebdriverIO.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![WDIO](https://img.shields.io/badge/WebdriverIO-v9-orange)](https://webdriver.io/)

---

## 💡 O Problema

Em testes automatizados mobile, mudanças visuais simples na interface (como alteração de IDs, pequenos ajustes de textos ou refatorações de layout) quebram constantemente os seletores tradicionais (`XPath`, `Accessibility ID`, etc.). Isso gera falsos negativos nos pipelines de CI/CD e exige manutenção humana constante e custosa de testes.

## 🚀 A Solução

O **Appium Mobile Self-Healing** intercepta falhas de localização de elementos em tempo de execução. Quando um seletor original quebra, o motor:

1. Extrai dinamicamente a árvore de nós atual da tela via `getPageSource()` do Appium.
2. Aplica um algoritmo de pontuação heurística baseado em múltiplos critérios (classe, similaridade de texto via _Distância de Levenshtein_, IDs parciais e proximidade de posição).
3. Seleciona o melhor candidato válido, valida o novo elemento e recupera a execução do teste sem interromper o pipeline.
4. Salva a solução em um cache histórico persistente para uso otimizado nas próximas execuções.

---

## 🛠️ Arquitetura do Sistema

O projeto é modular e dividido em responsabilidades claras:

- **`healing-engine.js`**: Orquestrador central que intercepta as falhas e gerencia o fluxo de recuperação.
- **`similarity-score.js`**: Motor matemático responsável por calcular os pesos heurísticos (`Class`, `Text`, `ID`, `Position`).
- **`selector-analyzer.js`**: Faz o parse determinístico da hierarquia XML da tela e reconstrói seletores UiSelector/XPath otimizados.
- **`selector-history.js`**: Gerencia a memória de soluções conhecidas (JSON + Cache em memória).
- **`healing-logger.js`**: Padroniza logs de auditoria e relatórios de sucesso/falha.

---

## 📦 Instalação

```bash
npm install appium-self-healing-mobile --save-dev

```

---

## ⚙️ Configuração Avançada (Opcional)

A biblioteca funciona de forma _plug-and-play_ com valores padrão, mas você pode customizar o comportamento, os pesos heurísticos e os caminhos de saída dos relatórios injetando as seguintes variáveis de ambiente no seu CI ou usando um arquivo `.env` (via pacote `dotenv` no seu projeto principal):

```env
# Ativação e sensibilidade do motor
SELF_HEALING_ENABLED=true
HEALING_DEBUG=false
HEALING_MIN_THRESHOLD=0.70

# Customização de caminhos (Ideal para pipelines de CI/CD)
HEALING_LOG_DIR=./relatorios/self-healing/logs
HEALING_HISTORY_PATH=./relatorios/self-healing/memoria/selector-history.json

# Ajuste fino da pontuação heurística (Soma = 1.0)
HEALING_WEIGHT_CLASS=0.4
HEALING_WEIGHT_TEXT=0.3
HEALING_WEIGHT_ID=0.2
HEALING_WEIGHT_POSITION=0.1

```

---

## 🚀 Como Usar

### 1. Inicialização (Ex: no hook `beforeSuite` do WebdriverIO)

```javascript
import selfHealing from "appium-self-healing-mobile";

// No início da suíte de testes
selfHealing.initialize(driver, "LoginSpec.js", {
  enabled: true,
});
```

### 2. Utilização Direta (Wrappers Seguros)

Você pode substituir suas chamadas tradicionais de busca ou utilizar os wrappers prontos:

```javascript
import { healingEngine } from "appium-self-healing-mobile";

// Busca inteligente com fallback automático para self-healing
const element = await healingEngine.healingFind(
  'android=new UiSelector().text("Entrar")',
);

// Ou utilizando ações diretas:
await healingEngine.healingClick(
  'android=new UiSelector().resourceId("com.app:id/btn_submit")',
);
await healingEngine.healingSetText(
  'android=new UiSelector().resourceId("com.app:id/input_email")',
  "usuario@email.com",
);
```

---

## 📊 Relatórios e Estatísticas

O sistema gera automaticamente logs detalhados em `output/logs/self-healing/` e permite exportar estatísticas completas de recuperações bem-sucedidas:

```javascript
const stats = selfHealing.getStats();
console.log(stats);
```

---

## 🤝 Contribuindo

Contribuições, issues e pull requests são super bem-vindos! Sinta-se à vontade para abrir uma issue para discutir melhorias ou novos recursos.

## 📝 Licencia

Este projeto está sob a licença [MIT](https://www.google.com/search?q=LICENSE&utm_source=gemini).
