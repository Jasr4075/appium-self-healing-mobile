/**
 * Verificação estática dos tipos públicos da biblioteca.
 * Compilado via "npm run test:types" (tsc --noEmit).
 */
import selfHealing, {
  healingEngine,
  selectorAnalyzer,
  similarityScore,
  selectorHistory,
  healingLogger,
  initialize,
  find,
  healingFind,
  healingClick,
  healingSetText,
  healingGetText,
} from "appium-self-healing-mobile";

const driver: any = {};

initialize(driver, "login.spec", { enabled: true });
initialize(driver, "login.spec");
void find(driver, "~start");

async function run(): Promise<void> {
  const element = await healingFind("~start", { useHistory: false });
  void element;

  await healingClick("~start");
  await healingSetText("~campo", "texto");

  const text: string = await healingGetText("~campo");
  void text;

  const weights = similarityScore.getWeights();
  const classWeight: number = weights.class;
  void classWeight;

  const threshold: number = similarityScore.MIN_THRESHOLD;
  void threshold;

  const score = similarityScore.calculate("~start", { class: "android.widget.Button" });
  const isValid: boolean = score.isValid;
  void isValid;

  const parsed = similarityScore.parseSelector('android=new UiSelector().text("x")');
  const parsedText: string | null = parsed.text;
  void parsedText;

  selectorHistory.add({
    originalSelector: "~start",
    newSelector: 'android=new UiSelector().text("Iniciar").instance(0)',
    score: 0.7,
    reasons: ["text-exact"],
    spec: "login.spec",
  });

  const entry = selectorHistory.find("~start", "login.spec");
  void entry;

  const stats = healingEngine.getStats();
  const total: number = stats.history.totalEntries;
  void total;

  healingEngine.setEnabled(false);
  healingEngine.configure(driver, "outro.spec");
  healingEngine.exportReport("./relatorio.json");
  healingEngine.cleanupHistory(7);

  const selector: string = selectorAnalyzer.createSelector({
    class: "android.widget.Button",
    id: "com.app:id/ok",
    text: "OK",
    contentDesc: null,
    clickable: true,
    enabled: true,
    index: 0,
    bounds: "[0,0][10,10]",
  });
  void selector;

  const valid = await selectorAnalyzer.isValidSelector(selector);
  void valid;

  const elements = await selectorAnalyzer.getScreenElements();
  void elements;

  const screen = await selectorAnalyzer.getScreenStats();
  const classes: string[] = screen.classes;
  void classes;

  healingLogger.logInfo("ok");
  healingLogger.logSuccess({
    originalSelector: "~start",
    newSelector: "~iniciar",
    score: 0.8,
    reasons: ["text-exact"],
    spec: "login.spec",
  });

  const report = healingLogger.generateReport("2026-09-23");
  const successes: number = report.success;
  void successes;
}

void run;

const viaDefault = selfHealing.healingFind("~start");
void viaDefault;
selfHealing.getStats();
selfHealing.cleanup(0);
selfHealing.exportReport("./relatorio.json");
void selfHealing.healingEngine.enabled;