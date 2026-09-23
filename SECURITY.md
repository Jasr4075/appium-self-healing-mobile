# Política de Segurança

## Versões suportadas

| Node.js | Suporte |
| ------- | ------- |
| >= 22.12 | ✅ Ativo |
| < 22.12  | ❌ Não suportado (EOL) |

## Reportando uma vulnerabilidade

**Para vulnerabilidades de segurança, não abra uma issue pública.**

Envie as informações por e-mail para o mantenedor (**@Jasr4075**) ou por contato privado no GitHub, incluindo:

1. Descrição do problema.
2. Pacote/dependência afetada e versão.
3. Instruções de reprodução ou PoC.
4. Impacto potencial estimado.

Esperamos uma resposta inicial em até **48 horas**. Se confirmada, uma correção será publicada e divulgada no [CHANGELOG](CHANGELOG.md), e a issue só será revelada publicamente após o fix ser lançado.

## Práticas do projeto

- **Cobertura de testes em 100%** com gate de `--check-coverage`.
- **Tipagens públicas** validadas por `tsc` no CI (`test:types`).
- **Lint/format/audit** como gates obrigatórios no CI (`lint`, `format:check`, `audit`).
- Script `npm run audit` para conferir o estado de segurança localmente.

## Dependências

Esta biblioteca **não possui dependências de runtime** (zero `dependencies`). As únicas dependências declaradas são:
- `peerDependencies` (`webdriverio`) — responsabilidade do consumidor, não empacotada.
- `devDependencies` — apenas para desenvolvimento/teste/CI, não publicadas no tarball.

Um `overrides` força `@puppeteer/browsers >= 3` para descontinuar o `extract-zip` (CVE-2026-56876) na árvore de desenvolvimento.