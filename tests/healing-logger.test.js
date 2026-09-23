import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-logger-'));

process.env.HEALING_LOG_DIR = tmpDir;

const { default: healingLogger } = await import('../src/healing-logger.js');

function captureConsole(method) {
  const calls = [];
  const original = console[method];
  console[method] = (...args) => calls.push(args.join(' '));
  return {
    calls,
    restore() {
      console[method] = original;
    },
  };
}

test('healingLogger: logSuccess escreve linha com marcador SUCCESS e imprime no console', () => {
  const spy = captureConsole('log');
  const data = {
    originalSelector: 'sel-1',
    newSelector: 'sel-2',
    score: 0.9,
    reasons: ['text-exact', 'id-partial'],
    spec: 'spec-a',
  };

  healingLogger.logSuccess(data);
  spy.restore();

  const logFile = path.join(tmpDir, `healing-${new Date().toISOString().split('T')[0]}.log`);
  const content = fs.readFileSync(logFile, 'utf8');

  assert.ok(content.includes('[SELF-HEALING SUCCESS]'));
  assert.ok(content.includes('Spec: spec-a'));
  assert.ok(content.includes('Original: sel-1'));
  assert.ok(content.includes('New: sel-2'));
  assert.ok(content.includes('Score: 0.90'));
  assert.ok(content.includes('Reasons: text-exact, id-partial'));
  assert.ok(spy.calls.length >= 1);
});

test('healingLogger: logFailure escreve linha com marcador FAILURE', () => {
  const spy = captureConsole('log');
  healingLogger.logFailure({
    originalSelector: 'sel-1',
    spec: 'spec-a',
    reason: 'Elemento ausente',
  });
  spy.restore();

  const logFile = path.join(tmpDir, `healing-${new Date().toISOString().split('T')[0]}.log`);
  const content = fs.readFileSync(logFile, 'utf8');

  assert.ok(content.includes('[SELF-HEALING FAILURE]'));
  assert.ok(content.includes('Reason: Elemento ausente'));
});

test('healingLogger: logDebug imprime no console apenas com HEALING_DEBUG=true', () => {
  process.env.HEALING_DEBUG = 'true';
  const spyOn = captureConsole('log');
  healingLogger.logDebug('mensagem de debug');
  spyOn.restore();

  assert.ok(spyOn.calls.some((call) => call.includes('[DEBUG] mensagem de debug')));

  delete process.env.HEALING_DEBUG;
  const spyOff = captureConsole('log');
  healingLogger.logDebug('mensagem silenciosa');
  spyOff.restore();

  assert.equal(spyOff.calls.length, 0);
});

test('healingLogger: logInfo escreve marcador INFO', () => {
  const spy = captureConsole('log');
  healingLogger.logInfo('inicializando');
  spy.restore();

  const logFile = path.join(tmpDir, `healing-${new Date().toISOString().split('T')[0]}.log`);
  const content = fs.readFileSync(logFile, 'utf8');
  assert.ok(content.includes('[INFO] inicializando'));
});

test('healingLogger: generateReport retorna zeros quando arquivo não existe', () => {
  const stats = healingLogger.generateReport('2099-01-01');
  assert.deepEqual(stats, { success: 0, failure: 0, total: 0 });
});

test('healingLogger: generateReport soma sucessos e falhas e calcula successRate', () => {
  const stats = healingLogger.generateReport();
  assert.ok(stats.success >= 1);
  assert.ok(stats.failure >= 1);
  assert.equal(stats.total, stats.success + stats.failure);
  assert.ok(stats.successRate.endsWith('%'));
  assert.notEqual(stats.successRate, '0%');
});

test('healingLogger: generateReport retorna 0% quando só há linhas INFO', () => {
  const past = '2020-05-05';
  const logFile = path.join(tmpDir, `healing-${past}.log`);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] [INFO] algo\n`, 'utf8');

  const stats = healingLogger.generateReport(past);
  assert.ok(stats.successRate.includes('0%'));
  assert.equal(stats.success, 0);
  assert.equal(stats.failure, 0);
});

test('healingLogger: generateReport trata erro de leitura e retorna zeros', () => {
  const date = '2015-06-01';
  const dirAsFile = path.join(tmpDir, `healing-${date}.log`);
  fs.mkdirSync(dirAsFile, { recursive: true });

  const stats = healingLogger.generateReport(date);
  assert.deepEqual(stats, { success: 0, failure: 0, total: 0 });
});

test('healingLogger: writeToFile captura erro ao criar diretório', () => {
  const spy = captureConsole('error');
  const blocker = path.join(tmpDir, 'blocker');
  fs.writeFileSync(blocker, 'x');

  const oldDir = healingLogger.logDir;
  healingLogger.logDir = path.join(blocker, 'subdir');
  healingLogger.logInfo('vai falhar');
  healingLogger.logDir = oldDir;
  spy.restore();

  assert.ok(spy.calls.length >= 1);
});
