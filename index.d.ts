/**
 * Tipos públicos do appium-self-healing-mobile.
 * Acompanham as exportações de src/index.js.
 */

export type Driver = any;

export interface HealOptions {
  useHistory?: boolean;
}

export interface WeightConfig {
  class: number;
  text: number;
  id: number;
  position: number;
}

export interface ScoreBreakdown {
  class: number;
  text: number;
  id: number;
  position: number;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  isValid: boolean;
}

export interface ParsedSelector {
  type: 'accessibility' | 'text' | 'id' | 'class' | null;
  value: string | null;
  class: string | null;
  text: string | null;
  id: string | null;
  instance: number | null;
}

export interface ScreenElement {
  class: string;
  id: string | null;
  text: string | null;
  contentDesc: string | null;
  clickable: boolean;
  enabled: boolean;
  index: number;
  bounds: string | null;
}

export interface ScreenStats {
  totalElements: number;
  clickableElements: number;
  elementsWithId: number;
  elementsWithText: number;
  classes: string[];
}

export interface HistoryEntry {
  originalSelector: string;
  newSelector: string;
  score: number;
  reasons: string[];
  spec: string;
  timestamp: string;
  success: boolean;
  context: Record<string, unknown>;
}

export interface HistoryInput {
  originalSelector: string;
  newSelector: string;
  score: number;
  reasons: string[];
  spec: string;
  success?: boolean;
  context?: Record<string, unknown>;
}

export interface HistoryStats {
  totalEntries: number;
  successfulHealings: number;
  successRate: string;
  uniqueSpecs: number;
  uniqueSelectors: number;
  averageScore: string;
  mostProblematic: Array<{ selector: string; count: number }>;
}

export interface HealingStats {
  enabled: boolean;
  currentSpec: string;
  history: HistoryStats;
}

export interface ReportStats {
  success: number;
  failure: number;
  total: number;
  successRate?: string;
}

export class HealingEngine {
  driver: Driver;
  enabled: boolean;
  maxAttempts: number;
  currentSpec: string;

  configure(driver: Driver, specName?: string): void;
  setEnabled(enabled: boolean): void;
  healingFind(selector: string, options?: HealOptions): Promise<any>;
  attemptHealing(originalSelector: string, options?: HealOptions): Promise<any>;
  healingClick(selector: string, options?: HealOptions): Promise<void>;
  healingSetText(selector: string, text: string, options?: HealOptions): Promise<void>;
  healingGetText(selector: string, options?: HealOptions): Promise<string>;
  healingWaitForExist(selector: string, timeout?: number, options?: HealOptions): Promise<void>;
  getStats(): HealingStats;
  exportReport(outputPath: string): void;
  cleanupHistory(days?: number): void;
}

export class SelectorAnalyzer {
  driver: Driver;

  setDriver(driver: Driver): void;
  getScreenElements(): Promise<ScreenElement[]>;
  parsePageSource(xml: string): ScreenElement[];
  extractAttributes(tagName: string, attributesStr: string, index: number): ScreenElement;
  isVisible(bounds: string | null): boolean;
  isRelevantElement(element: ScreenElement): boolean;
  findSimilarElements(
    criteria: Partial<Pick<ScreenElement, 'class' | 'id' | 'text'>>,
  ): Promise<ScreenElement[]>;
  createSelector(element: ScreenElement): string;
  isValidSelector(selector: string): Promise<boolean>;
  getScreenStats(): Promise<ScreenStats>;
}

export class SimilarityScore {
  getWeights(): WeightConfig;
  getMinThreshold(): number;
  get MIN_THRESHOLD(): number;
  calculate(
    originalSelector: string,
    candidate: Partial<ScreenElement>,
    originalIndex?: number | null,
  ): ScoreResult;
  parseSelector(selector: string): ParsedSelector;
  isSimilarClass(class1: string, class2: string): boolean;
  calculateTextSimilarity(text1: string, text2: string): number;
  levenshteinDistance(s1: string, s2: string): number;
  isPartialMatch(id1: string, id2: string): boolean;
  calculatePositionSimilarity(index1: number, index2: number): number;
  filterValidCandidates(results: ScoreResult[]): ScoreResult[];
}

export class SelectorHistory {
  historyFile: string;
  history: HistoryEntry[] | null;

  ensureDirectory(): void;
  loadHistory(): HistoryEntry[];
  saveHistory(): void;
  buildCache(): void;
  generateKey(selector: string, spec: string): string;
  add(entry: HistoryInput): void;
  find(originalSelector: string, spec: string): HistoryEntry | null;
  findBySpec(spec: string): HistoryEntry[];
  findByOriginalSelector(selector: string): HistoryEntry[];
  hasEntry(selector: string, spec: string): boolean;
  getStats(): HistoryStats;
  cleanup(days?: number): void;
  export(outputPath: string): void;
  clear(): void;
}

export class HealingLogger {
  logDir: string;

  ensureLogDirectory(): void;
  logSuccess(data: {
    originalSelector: string;
    newSelector: string;
    score: number;
    reasons: string[];
    spec: string;
  }): void;
  logFailure(data: { originalSelector: string; spec: string; reason: string }): void;
  logDebug(message: string): void;
  logInfo(message: string): void;
  writeToFile(message: string): void;
  generateReport(date?: string): ReportStats;
}

export declare const healingEngine: HealingEngine;
export declare const selectorAnalyzer: SelectorAnalyzer;
export declare const similarityScore: SimilarityScore;
export declare const selectorHistory: SelectorHistory;
export declare const healingLogger: HealingLogger;

export function initialize(driver: Driver, specName: string, options?: { enabled?: boolean }): void;
export function find(driver: Driver, selector: string): Promise<any>;
export function healingFind(selector: string, options?: HealOptions): Promise<any>;
export function healingClick(selector: string, options?: HealOptions): Promise<void>;
export function healingSetText(
  selector: string,
  text: string,
  options?: HealOptions,
): Promise<void>;
export function healingGetText(selector: string, options?: HealOptions): Promise<string>;

interface SelfHealing {
  healingEngine: HealingEngine;
  selectorAnalyzer: SelectorAnalyzer;
  similarityScore: SimilarityScore;
  selectorHistory: SelectorHistory;
  healingLogger: HealingLogger;
  initialize: typeof initialize;
  find: typeof find;
  healingFind: typeof healingFind;
  healingClick: typeof healingClick;
  healingSetText: typeof healingSetText;
  healingGetText: typeof healingGetText;
  getStats: () => HealingStats;
  exportReport: (outputPath: string) => void;
  cleanup: (days?: number) => void;
}

declare const selfHealing: SelfHealing;
export default selfHealing;
