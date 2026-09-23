import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const { default: healingLogger } = await import("../src/healing-logger.js");

test("healingLogger: usa diretório padrão quando HEALING_LOG_DIR não está definido", () => {
  assert.equal(process.env.HEALING_LOG_DIR, undefined);
  assert.equal(
    healingLogger.logDir,
    path.join(process.cwd(), "output", "logs", "self-healing"),
  );
});