// ─── wiring — ningún guardrail está desconectado ─────────────────────────────
//
// Este comando existe porque un guardrail que no ejecuta nadie es indistinguible
// de uno que pasa. Su propia suite tiene que probarlo igual: cada caso inyecta
// una forma real de desconectar una puerta y comprueba que se caza.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crearFixture, borrar, escribir, paquete, correr } from "./ayudantes";

let dir: string;
beforeEach(() => {
  dir = crearFixture("wiring");
});
afterEach(() => borrar(dir));

/** Un proyecto con un guardrail propio y un hook que lo invoca. */
function proyectoSano() {
  paquete(dir, { scripts: { "lint:x": "node scripts/check-x.mjs" } });
  escribir(dir, "scripts/check-x.mjs", "process.exit(0);\n");
  escribir(dir, ".husky/pre-commit", "#!/bin/sh\nnode scripts/check-x.mjs\n");
}

describe("wiring", () => {
  it("pasa cuando el guardrail se invoca desde un hook", () => {
    proyectoSano();
    expect(correr("wiring", dir).code).toBe(0);
  });

  it("CAZA un guardrail que no invoca nadie", () => {
    paquete(dir, { scripts: { "lint:x": "node scripts/check-x.mjs" } });
    escribir(dir, "scripts/check-x.mjs", "process.exit(0);\n");
    const r = correr("wiring", dir);
    expect(r.code, "existe y no lo ejecuta nada").toBe(1);
    expect(r.out + r.err).toMatch(/check-x\.mjs/);
  });

  it("CAZA un guardrail COMENTADO en su hook (SESS-144)", () => {
    // La forma más realista de desactivar una puerta: alguien comenta la línea
    // para desatascarse y se olvida de deshacerlo. La búsqueda encontraba el
    // texto —la almohadilla no lo borra— y el comando informaba «conectado» en
    // verde con la puerta muerta.
    paquete(dir, { scripts: { "lint:x": "node scripts/check-x.mjs" } });
    escribir(dir, "scripts/check-x.mjs", "process.exit(0);\n");
    escribir(dir, ".husky/pre-commit", "#!/bin/sh\n# node scripts/check-x.mjs\n");
    expect(correr("wiring", dir).code, "una línea comentada no invoca nada").toBe(1);
  });

  it("CAZA un hook que invoca un script inexistente", () => {
    paquete(dir, { scripts: {} });
    escribir(dir, ".husky/pre-commit", "#!/bin/sh\nnpm run lint:fantasma\n");
    expect(correr("wiring", dir).code).toBe(1);
  });

  it("acepta lo declarado manual, con su razón", () => {
    paquete(dir, { scripts: { "lint:pos": "guardrails worktree" } });
    escribir(dir, "guardrails.config.json", JSON.stringify({
      wiring: { manual: { worktree: "chequeo de arranque, no puerta" } },
    }));
    const r = correr("wiring", dir);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/manual/);
  });

  it("CAZA una versión fijada que no cuadra con package.json", () => {
    paquete(dir, {
      scripts: { "lint:x": "node scripts/check-x.mjs" },
      devDependencies: { guardrails: "github:o/guardrails#v2.0.0" },
    });
    escribir(dir, "scripts/check-x.mjs", "process.exit(0);\n");
    escribir(dir, ".husky/pre-commit", "#!/bin/sh\nnode scripts/check-x.mjs\n");
    escribir(dir, ".github/workflows/ci.yml", "jobs:\n  a:\n    steps:\n      - run: npx guardrails#v1.0.0 nul\n");
    const r = correr("wiring", dir);
    expect(r.code, "el workflow fija otra versión que package.json").toBe(1);
    expect(r.out + r.err).toMatch(/v1\.0\.0/);
  });

  it("sin guardrails propios pasa, pero lo dice y sigue comprobando", () => {
    // No es una salida temprana: un proyecto que sólo usa los comandos del
    // paquete no tiene nada que conectar, pero sí algo que comprobar — que lo
    // invocado exista. Saltárselo fue un agujero real, cazado por el test de
    // arriba.
    paquete(dir, { scripts: {} });
    const r = correr("wiring", dir);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no declara guardrails propios/i);
  });
});
