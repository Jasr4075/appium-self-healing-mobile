/**
 * Mutações de interface do experimento (Capítulo 5).
 *
 * Cada mutação é aplicada sobre o subjects já instrumentado e é revertida ao
 * final da execução. Todas carregam a HIPÓTESE PRÉ-REGISTRADA e o SCORE
 * PREVISTO, calculados a partir do modelo S = 0,4·σ_cls + 0,3·σ_txt + 0,2·σ_id
 * + 0,1·σ_pos com o limiar τ = 0,70, usando os atributos reais observados no
 * page source do iFiandi 2.1.0.
 *
 * Seletor de referência usado pela suíte (composto):
 *   className + resourceId + description
 *
 * Atributos reais do alvo "Entrar" (step-002/elements.json):
 *   class=android.widget.Button  content-desc=Entrar  text=(vazio)
 */

/**
 * Constrói o bloco JSX de um botão de alternância de modo da AuthScreen.
 * Usado pela mutação M4 para garantir que a troca de posição seja um puro
 * reordenamento, sem qualquer outra alteração de conteúdo.
 * @param {Object} botao - Dados do botão
 * @returns {string} Bloco JSX
 */
function blocoBotaoModo({ testID, tituloSignup, tituloLogin, primary, modo }) {
  return `            <AppButton
              testID="${testID}"
              title={isSignUp ? t('auth.${tituloSignup}') : t('auth.${tituloLogin}')}
              primary={${primary}}
              onPress={() => {
                switchMode(mode, '${modo}');
                setError('');
                setSuccessMessage('');
              }}
              style={styles.modeButton}
            />
`;
}

const BOTAO_TELEFONE = blocoBotaoModo({
  testID: "btn_auth_use_phone",
  tituloSignup: "signupWithPhone",
  tituloLogin: "usePhone",
  primary: "isPhone",
  modo: "phone",
});

const BOTAO_EMAIL = blocoBotaoModo({
  testID: "btn_auth_use_email",
  tituloSignup: "signupWithEmail",
  tituloLogin: "useEmail",
  primary: "!isPhone",
  modo: "email",
});

export const MUTACOES = [
  {
    id: "M1",
    nome: "Identificador renomeado",
    tela: "step-002",
    categoria: "ID",
    descricao:
      "O testID do botão de envio de acesso é renomeado de btn_auth_signin para " +
      "btn_auth_submit, simulando refatoração de nomenclatura no app.",
    portador: "resource-id (testID)",
    hipotese: "A cura ocorre por similaridade parcial de identificador (σ_id = 0,7).",
    scorePrevisto: 0.84,
    curaPrevista: true,
    falsoPositivoPrevisto: false,
    alvo: {
      descricao: "Botão de envio do formulário de acesso por e-mail",
      resourceIdOriginal: "btn_auth_signin",
      contentDesc: "Entrar",
      className: "android.widget.Button",
    },
    edicoes: [
      {
        arquivo: "src/screens/AuthScreen/index.js",
        de: '                testID="btn_auth_signin"\n',
        para: '                testID="btn_auth_submit"\n',
      },
    ],
  },

  {
    id: "M2",
    nome: "Rótulo alterado",
    tela: "step-002",
    categoria: "TEXTO",
    descricao:
      "O rótulo acessível do campo de e-mail muda de 'E-mail' para 'E-mail de acesso', " +
      "simulando revisão de copy pelo time de produto.",
    portador: "content-desc / text (internacionalização)",
    hipotese:
      "A cura ocorre por similaridade textual parcial (σ_txt = 0,9, o rótulo novo " +
      "contém o antigo).",
    scorePrevisto: 0.87,
    curaPrevista: true,
    falsoPositivoPrevisto: false,
    alvo: {
      descricao: "Campo de e-mail do formulário de acesso",
      resourceIdOriginal: "input_auth_email",
      contentDesc: "E-mail",
      className: "android.widget.EditText",
    },
    edicoes: [
      {
        arquivo: "src/i18n/translations/pt.js",
        de: "    email: 'E-mail',\n",
        para: "    email: 'E-mail de acesso',\n",
      },
    ],
  },

  {
    id: "M3",
    nome: "Identificador removido",
    tela: "step-001",
    categoria: "ID",
    descricao:
      "O testID do botão que alterna para o acesso por e-mail é removido, " +
      "simulando a perda do gancho de automação em uma atualização do app.",
    portador: "resource-id (testID)",
    hipotese:
      "A cura NÃO ocorre como esperado e o mecanismo produz FALSO POSITIVO: o alvo " +
      "correto fica em 0,70 (classe + rótulo), mas o botão irmão 'Entrar com " +
      "telefone' alcança 0,75, pois σ_id parcial não distingue btn_auth_use_* e " +
      "σ_txt dá 0,7 ao prefixo compartilhado 'entrar com '. Com τ = 0,80 o falso " +
      "positivo desaparece, mas a cura também não ocorre.",
    scorePrevisto: 0.75,
    curaPrevista: false,
    falsoPositivoPrevisto: true,
    alvo: {
      descricao: "Botão que alterna o acesso para e-mail",
      resourceIdOriginal: "btn_auth_use_email",
      contentDesc: "Entrar com e-mail",
      className: "android.widget.Button",
    },
    edicoes: [
      {
        arquivo: "src/screens/AuthScreen/index.js",
        de: '              testID="btn_auth_use_email"\n',
        para: "",
      },
    ],
  },

  {
    id: "M4",
    nome: "Reordenação dos elementos",
    tela: "step-001",
    categoria: "POSIÇÃO",
    descricao:
      "Os botões de alternância 'Entrar com telefone' e 'Entrar com e-mail' trocam " +
      "de posição na linha de modes, simulando reorganização de layout.",
    portador: "posição na hierarquia",
    hipotese:
      "A HIPÓTESE É REFUTADA: com classe, identificador e rótulo preservados, a " +
      "posição não altera o score (σ_pos tem peso 0,1 e só atua como desempate), " +
      "portanto a cura ocorre sem qualquer degradação.",
    scorePrevisto: 0.9,
    curaPrevista: true,
    falsoPositivoPrevisto: false,
    refutaHipótese: true,
    alvo: {
      descricao: "Botão que alterna o acesso para e-mail",
      resourceIdOriginal: "btn_auth_use_email",
      contentDesc: "Entrar com e-mail",
      className: "android.widget.Button",
    },
    edicoes: [
      {
        arquivo: "src/screens/AuthScreen/index.js",
        de: BOTAO_TELEFONE + BOTAO_EMAIL,
        para: BOTAO_EMAIL + BOTAO_TELEFONE,
      },
    ],
  },

  {
    id: "M5",
    nome: "Classe do elemento alterada",
    tela: "step-002",
    categoria: "CLASSE",
    descricao:
      "O papel acessível do botão de envio é removido, fazendo o page source reportar " +
      "a classe android.view.ViewGroup no lugar de android.widget.Button.",
    portador: "accessibilityRole (classe nativa)",
    hipotese:
      "A cura NÃO ocorre: sem classe, o melhor score é σ_id + σ_txt = 0,5, abaixo " +
      "de τ = 0,70. Falha legítima do mecanismo diante de deriva estrutural.",
    scorePrevisto: 0.5,
    curaPrevista: false,
    falsoPositivoPrevisto: false,
    alvo: {
      descricao: "Botão de envio do formulário de acesso por e-mail",
      resourceIdOriginal: "btn_auth_signin",
      contentDesc: "Entrar",
      className: "android.widget.Button",
    },
    edicoes: [
      {
        arquivo: "src/components/AppButton.js",
        de: '        accessibilityRole="button"\n        accessibilityLabel={title}\n        testID={testID}\n',
        para: "        accessibilityLabel={title}\n        testID={testID}\n",
      },
    ],
  },

  {
    id: "M6",
    nome: "Elemento removido",
    tela: "step-001",
    categoria: "AUSÊNCIA",
    descricao:
      "O botão que alterna o acesso para e-mail é removido da tela, simulando " +
      "reorganização que elimina o elemento testado.",
    portador: "remoção do nó da hierarquia",
    hipotese:
      "A cura NÃO ocorre, mas o mecanismo produz FALSO POSITIVO: com o elemento " +
      "ausente, o melhor candidato é o botão irmão 'Entrar com telefone' com 0,75 " +
      "(classe exata + id parcial + prefixo textual). O teste aciona o elemento " +
      "errado em vez de falhar de forma explícita. Com τ = 0,80 o falso positivo " +
      "é evitado.",
    scorePrevisto: 0.75,
    curaPrevista: false,
    falsoPositivoPrevisto: true,
    alvo: {
      descricao: "Botão que alterna o acesso para e-mail",
      resourceIdOriginal: "btn_auth_use_email",
      contentDesc: "Entrar com e-mail",
      className: "android.widget.Button",
    },
    edicoes: [
      {
        arquivo: "src/screens/AuthScreen/index.js",
        de: "            <AppButton\n              testID=\"btn_auth_use_email\"\n              title={isSignUp ? t('auth.signupWithEmail') : t('auth.useEmail')}\n              primary={!isPhone}\n              onPress={() => {\n                switchMode(mode, 'email');\n                setError('');\n                setSuccessMessage('');\n              }}\n              style={styles.modeButton}\n            />\n",
        para: "",
      },
    ],
  },
];

/**
 * Busca uma mutação pelo identificador.
 * @param {string} id - Identificador da mutação (ex.: 'M1')
 * @returns {Object|undefined} Mutação encontrada
 */
export function buscarMutacao(id) {
  return MUTACOES.find((mutacao) => mutacao.id === id);
}
