/**
 * Patch de instrumentação do sujeito (aplicado em TODAS as execuções).
 *
 * O iFiandi 2.1.0 não expõe `resource-id` nos elementos do formulário de
 * acesso: a captura de page source real mostra apenas `action_bar_root` e
 * `content` com resource-id. Sem âncora de identificação, as mutações de
 * identificador (M1 e M3) não seriam observáveis.
 *
 * Este patch adiciona `testID` aos componentes, que o React Native expõe como
 * `resource-id` no page source do Android, sem alterar rótulo, texto, posição
 * nem comportamento. Corresponde à instrumentação do sujeito descrita na
 * subseção de preparação do Capítulo 5 e é revertido ao final de cada execução.
 *
 * Nada é commitado no repositório do app.
 */

export const INSTRUMENTACAO = {
  id: "baseline",
  titulo: "Instrumentação do sujeito (testID como âncora de resource-id)",
  descricao:
    "Adiciona testID a AppButton, AppInput e aos alvos do formulário de acesso, " +
    "tornando o resource-id observável no page source sem alterar a interface.",
  edicoes: [
    // --- AppButton: passa a aceitar e repassar testID ---
    {
      arquivo: "src/components/AppButton.js",
      de: "  small = false,\n}) {",
      para: "  small = false,\n  testID,\n}) {",
    },
    {
      arquivo: "src/components/AppButton.js",
      de: '        accessibilityRole="button"\n        accessibilityLabel={title}\n',
      para: '        accessibilityRole="button"\n        accessibilityLabel={title}\n        testID={testID}\n',
    },

    // --- AppInput: idem ---
    {
      arquivo: "src/components/AppInput.js",
      de: "  required = false,\n}) {",
      para: "  required = false,\n  testID,\n}) {",
    },
    {
      arquivo: "src/components/AppInput.js",
      de: "          accessibilityLabel={label || placeholder}\n",
      para: "          accessibilityLabel={label || placeholder}\n          testID={testID}\n",
    },

    // --- AuthScreen: âncoras dos alvos usados pelo LoginEmail.spec.js ---
    {
      arquivo: "src/screens/AuthScreen/index.js",
      de: "            <AppButton\n              title={isSignUp ? t('auth.signupWithPhone') : t('auth.usePhone')}\n",
      para: "            <AppButton\n              testID=\"btn_auth_use_phone\"\n              title={isSignUp ? t('auth.signupWithPhone') : t('auth.usePhone')}\n",
    },
    {
      arquivo: "src/screens/AuthScreen/index.js",
      de: "            <AppButton\n              title={isSignUp ? t('auth.signupWithEmail') : t('auth.useEmail')}\n",
      para: "            <AppButton\n              testID=\"btn_auth_use_email\"\n              title={isSignUp ? t('auth.signupWithEmail') : t('auth.useEmail')}\n",
    },
    {
      arquivo: "src/screens/AuthScreen/index.js",
      de: "              <AppInput\n                label={t('auth.email')}\n                placeholder={t('auth.emailPlaceholder')}\n",
      para: "              <AppInput\n                testID=\"input_auth_email\"\n                label={t('auth.email')}\n                placeholder={t('auth.emailPlaceholder')}\n",
    },
    {
      arquivo: "src/screens/AuthScreen/index.js",
      de: "              <AppInput\n                label={t('auth.password')}\n                placeholder={t('auth.passwordPlaceholder')}\n",
      para: "              <AppInput\n                testID=\"input_auth_password\"\n                label={t('auth.password')}\n                placeholder={t('auth.passwordPlaceholder')}\n",
    },
    {
      arquivo: "src/screens/AuthScreen/index.js",
      de: "              <AppButton\n                title={submitLabel}\n                onPress={handleSubmit}\n                primary\n                style={styles.submitButton}\n              />\n",
      para: '              <AppButton\n                testID="btn_auth_signin"\n                title={submitLabel}\n                onPress={handleSubmit}\n                primary\n                style={styles.submitButton}\n              />\n',
    },
  ],
};

/**
 * Retorna o patch de instrumentação do sujeito.
 * @returns {Object} Patch
 */
export function patchBaseline() {
  return INSTRUMENTACAO;
}
