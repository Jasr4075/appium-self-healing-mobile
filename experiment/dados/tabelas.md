# Resultados do experimento — tabelas do Capítulo 5

Execuções de tratamento analisadas: 15
Taxa de cura: 20.0%
Mutações curadas: 1 de 5
Precisão: 33.3% | Recall: 50.0% | F1: 40.0%
Verdadeiros positivos: 3 | Falsos positivos: 6 | Falsos negativos: 3

## Quadro 12 — Mutações de interface aplicadas ao sujeito

| Mutação | Categoria | Portador no app | Alvo | Score previsto | Cura prevista | Execuções | Curas | Score médio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | ID | resource-id (testID) | Botão de envio do formulário de acesso por e-mail | 0.84 | sim | 3 | 3 | 0.84 |
| M2 | TEXTO | content-desc / text (internacionalização) | Campo de e-mail do formulário de acesso | 0.87 | sim | 3 | 0 | — |
| M3 | ID | resource-id (testID) | Botão que alterna o acesso para e-mail | 0.75 | não | 3 | 0 | 0.75 |
| M4 | POSIÇÃO | posição na hierarquia | Botão que alterna o acesso para e-mail | 0.90 | sim | 3 | 0 | — |
| M5 | CLASSE | accessibilityRole (classe nativa) | Botão de envio do formulário de acesso por e-mail | 0.50 | não | 3 | 0 | — |
| M6 | AUSÊNCIA | remoção do nó da hierarquia | Botão que alterna o acesso para e-mail | 0.75 | não | 3 | 0 | 0.75 |

## Quadro 13 — Resultados por mutação e custo de manutenção

| Mutação | Hipótese | Curas corretas | Falsos positivos | Recusa correta | Sem efeito | Reparo manual (min) | Seletores alterados |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1 | cura | 3/3 | não | não | não | — | — |
| M2 | cura | 0/3 | não | não | não | — | — |
| M3 | não cura (FP) | 0/3 | 3 ocorrência(s) | não | não | — | — |
| M4 | cura | 0/3 | não | não | 3 execução(ões) | — | — |
| M5 | não cura | 0/3 | não | 3 ocorrência(s) | não | — | — |
| M6 | não cura (FP) | 0/3 | 3 ocorrência(s) | não | não | — | — |

## Quadro 14 — Hipótese pré-registrada × comportamento observado

| Mutação | Comportamento previsto | Comportamento observado | Confere? |
| --- | --- | --- | --- |
| M1 | cura | curou o elemento certo (score 0.84) | sim |
| M2 | cura | não curou | não |
| M3 | falso positivo | curou o elemento errado (3x) | sim |
| M4 | cura | seletor não afetado pela mutação | não |
| M5 | recusa | recusou curar | sim |
| M6 | falso positivo | curou o elemento errado (3x) | sim |

## Sensibilidade ao limiar de aceitação

| τ | Curas | Execuções | Taxa de cura | Falsos positivos |
| --- | --- | --- | --- | --- |
| 0.60 | 2 | 6 | 33.3% | 2 |
| 0.80 | 1 | 6 | 16.7% | não |
