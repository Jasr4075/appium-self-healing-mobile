# Changelog

Todas as mudanças relevantes deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.0.1] - Unreleased

### Adicionado
- Workflow de CI (GitHub Actions) validando os testes em Node 18, 20 e 22.
- Badge de cobertura de código com `c8`, atualiza automaticamente em cada push para `main`.
- Script `test:coverage` no `package.json`.
- Este changelog.
- Suíte completa de testes (`node:test`) com mock de driver WDIO cobrindo todos os módulos: `healing-engine`, `healing-logger`, `selector-history`, `index`, `selector-analyzer` e `similarity-score`.
- Cobertura de código em 100% (linhas, statements, branches e funções).

### Alterado
- Badges de CI e cobertura no README.

## [1.0.0] - 2026-09-22

### Adicionado
- Publicação inicial no npm (`appium-self-healing-mobile@1.0.0`).
- Módulos: `healing-engine`, `selector-analyzer`, `similarity-score`, `selector-history`, `healing-logger`.
- Entry point `index.js` com exports default e named (`initialize`, `find`, `healingFind`, `healingClick`, `healingSetText`, `healingGetText`, `getStats`, `exportReport`, `cleanup`).
- Configuração por variáveis de ambiente (`HEALING_LOG_DIR`, `HEALING_HISTORY_PATH`, `HEALING_DEBUG`, `HEALING_MIN_THRESHOLD` e pesos heurísticos).
- Criação lazy de diretórios: nenhum efeito colateral de I/O no import.
- Cobertura inicial de testes (`node:test`) para `similarity-score` e `selector-analyzer`.