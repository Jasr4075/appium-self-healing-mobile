# Experimento do Capítulo 5 — self-healing de seletores

Fase experimental que aplica mutações de interface no app **iFiandi** (sujeito),
executa o fluxo controlado de autenticação por e-mail e mede se o mecanismo de
self-healing recupera o elemento correto.

O experimento tem duas partes independentes:

| Parte               | Repositório                                 | Papel                                         |
| ------------------- | ------------------------------------------- | --------------------------------------------- |
| **Sujeito**         | `/home/usuario/Documentos/IFIANDI/iFiandi` | App que sofre as mutações. Nunca é commitado. |
| **Banco de ensaio** | este repositório (`TCC_TUDO_IA`)            | Suíte WDIO, harness, dados e análise.         |

O harness **aplica patches no sujeito, compila, executa e reverte**. O
repositório do app termina exatamente como começou: no mesmo commit, na mesma
branch e com a árvore limpa.

## Garantias de segurança

1. `run.js` aborta se o repositório do app já estiver sujo no início.
2. Cada patch exige **match exato** de conteúdo e cardinalidade. Se o app mudar,
   o experimento para em vez de adivinhar.
3. Ao final de cada célula, `restaurarArvore()` devolve todo arquivo rastreado
   ao commit, e a limpeza é reconferida.
4. Patches e mutações vivem em arquivos de dados (`experimento/patches/`), não
   em código de execução.
5. Nada é enviado ao repositório remoto: as alterações do sujeito existem
   apenas entre a aplicação e a reversão.

## Desenho pré-registrado

A matriz é declarada em código (`experimento/lib/matriz.js`) e vale para todas
as execuções. São **38 células** em **7 conjuntos de patches** (1 baseline + 6
mutações), com 3 repetições de tratamento por mutação:

| Grupo         | Execuções por mutação | Configuração                             |
| ------------- | --------------------- | ---------------------------------------- |
| Cura          | 3                     | self-healing ligado, τ = 0,70            |
| Controle      | 1                     | self-healing desligado, reparo manual    |
| Sensibilidade | 2                     | self-healing ligado, τ = 0,60 e τ = 0,80 |

Mais 2 execuções de baseline (sem mutação) para confirmar que o fluxo
controlado funciona antes e depois das alterações.

### Mutações

| Id  | Categoria     | Alvo                                   | Hipótese                                   |
| --- | ------------- | -------------------------------------- | ------------------------------------------ |
| M1  | Identificador | botão de envio do e-mail               | cura por `resource-id` parcial             |
| M2  | Texto         | campo de e-mail                        | cura por `content-desc`/texto similar      |
| M3  | Identificador | alternância para e-mail                | falso positivo: acerta o botão de telefone |
| M4  | Posição       | alternância para e-mail                | cura; a posição não é determinant          |
| M5  | Classe        | `accessibilityRole` de todos os botões | recusa correta                             |
| M6  | Ausência      | remoção do botão de e-mail             | falso positivo: acerta o botão de telefone |

## Uso

Pré-requisitos: Node `>= 22.12`, `adb` com o aparelho conectado, JDK e Android
SDK para o build do APK release.

```bash
npm run exp:verificar      # confere que os 7 conjuntos aplicam e revertem
npm run exp:matriz         # dry-run das 38 células, sem build e sem dispositivo
npm run exp:prever         # simula os scores sobre capturas reais, sem dispositivo
npm run exp:executar       # matriz completa no dispositivo
npm run exp:analisar       # tabelas do capítulo a partir dos resultados
```

Opções úteis de `run.js`:

| Opção              | Efeito                                             |
| ------------------ | -------------------------------------------------- |
| `--de=M1`          | executa só as células cujo id começa com `M1-`     |
| `--somente=M1,M3`  | executa apenas as mutações indicadas               |
| `--repeticoes=5`   | altera o número de repetições do tratamento        |
| `--taus=0.6,0.8`   | altera os limiares extras de sensibilidade         |
| `--sem-controle`   | não executa as células de controle                 |
| `--celular=<udid>` | exige um aparelho específico                       |
| `--pular-build`    | reaproveita o APK já instalado                     |
| `--reiniciar`      | apaga `dados/resultados.jsonl` antes de começar    |
| `--dry-run`        | aplica e reverte os patches, sem build/dispositivo |
| `--metro`          | aquece o bundle do Metro (apenas diagnóstico)      |

## Build do APK

A execução usa **APK release com o bundle JavaScript embutido**, não um
dev-client. Um dev-client sem bundle abre a tela do Expo em vez do app, e a
automação passa a medir uma tela que não é a do experimento.

Como cada mutação altera o código JavaScript, o APK é recompilado uma vez por
conjunto de patches: baseline e M1–M6, sete builds no total.

Três detalhes do ambiente obrigam a buildar assim:

- `--offline`: as dependências do Gradle já estão em cache e não há rede.
- `-PreactNativeArchitectures=arm64-v8a`: compilar as quatro ABIs padrão é
  desnecessariamente lento.
- `--no-build-cache` e a remoção dos assets de release gerados antes de cada
  build: a tarefa de bundle do Gradle não declara os fontes JavaScript como
  entrada, então o cache devolveria o bundle da build anterior e a mutação não
  chegaria ao aparelho.

Por isso, depois de cada build o runner confere que o APK contém exatamente o
bundle recém-gerado e que todos os `testID` da célula estão nele. Se a
conferência falhar, a execução para em vez de registrar um resultado inválido.

## Saídas

| Caminho                      | Conteúdo                                               |
| ---------------------------- | ------------------------------------------------------ |
| `dados/resultados.jsonl`     | um registro por execução (append)                      |
| `dados/resultados.json`      | métricas consolidadas                                  |
| `dados/tabelas.md`           | quadros prontos para o capítulo                        |
| `dados/logs/<célula>/`       | `healing-report.json`, `page-source.xml`, logs do WDIO |
| `dados/matriz-dry-run.jsonl` | verificação de patches, fora da análise                |

Dois arquivos da pasta `dados/` são preenchidos pelo autor, porque dependem de
ação humana:

- `revisao-manual.json` — veredito por célula: `{"M3-trat-r1": "errado"}`.
  Distingue "o mecanismo curou" de "o mecanismo curou o elemento certo". Sem
  esse arquivo, a análise infere a qualidade da cura pelo resultado do teste e
  marca a classificação como provisória.
- `reparo-manual.json` — custo do reparo nos controles:
  `{"M1-ctrl-r1": {"minutos": 7, "seletoresAlterados": 1}}`.

## Isolamento entre execuções

Antes de cada execução, o runner apaga o relatório de cura e o histórico de
seletores curados. Sem isso, duas contaminações ocorreriam: o relatório da
célula anterior seria creditado à atual, e uma solução do histórico poderia
satisfazer a busca sem qualquer cálculo de similaridade. O tamanho do
histórico ao final de cada execução é registrado em `entradasHistorico`.

## Teste do pipeline de análise

```bash
npm run exp:testar-analise
```

Gera dados sintéticos que reproduzem a simulação de scores e verifica se a
análise calcula corretamente a matriz de confusão. Não coleta dados reais.

## Proveniência e correspondência com o TCC

- **Execuções:** 38 células, realizadas em 25/09/2026 (16h36–17h02, UTC−3), em Motorola Edge 70.
- **`dados/resultados.jsonl`:** um registro por execução, com `apkSha256`, `apkBytes`, hashes dos fontes alterados e duração. É a fonte dos números do Capítulo 5.
- **`dados/tabelas.md`:** tabelas consolidadas (Quadros 12 a 14 do texto).
- **`dados/logs/<célula>/`:** saída bruta de cada execução (`wdio-stdout.log`, `page-source.xml`, `healing-report.json`).
- **`dados/revisao-manual.json`:** classificação manual de cada execução de tratamento (o oráculo usado nas tabelas).
- **`dados/reparo-manual.json`:** campos de tempo de reparo por execução de controle; permanecem nulos porque o tempo não foi aferido.
- **`dados/vigia.log`:** trilha do vigilante de restauração do repositório do app.

Este diretório corresponde ao Apêndice A do TCC e às seções 5.1 a 5.4. As versões brutas dos APKs não são versionadas (binários grandes); a identificação de cada build está no `resultados.jsonl`.

## Dados sensíveis

Antes da publicação, foram mascarados nos logs: e-mail e senha da conta de teste, o UDID do aparelho e o caminho local do usuário. Nenhum escore, seletor, tempo ou classificação foi alterado. A substituição não afeta a reprodução dos números do Capítulo 5.
