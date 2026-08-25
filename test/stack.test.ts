// ─── stack — el stack documentado existe de verdad ───────────────────────────
//
// Existe porque una tabla de stack miente sin que nadie lo note, y la mentira no
// es inofensiva: un proyecto afirmó durante meses usar una librería de caché que
// no tenía una sola llamada en `src/`, y esa afirmación BLINDÓ la dependencia
// frente a la auditoría que sí eliminó otras.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crearFixture, borrar, escribir, paquete, correr } from "./ayudantes";

const CFG = JSON.stringify({
  stack: { ambito: ["AGENTS.md"], workflows: ".github/workflows", schema: null },
});

let dir: string;
beforeEach(() => {
  dir = crearFixture("stack");
  escribir(dir, "guardrails.config.json", CFG);
});
afterEach(() => borrar(dir));

describe("stack", () => {
  it("pasa cuando lo documentado está instalado", () => {
    paquete(dir, { dependencies: { next: "^16.0.0" } });
    escribir(dir, "AGENTS.md", "# Stack\n\n| Pieza | Nota |\n| --- | --- |\n| `next` | El framework |\n");
    expect(correr("stack", dir).code).toBe(0);
  });

  it("`schema: null` no se confunde con un esquema perdido", () => {
    // Son cosas distintas: «este proyecto no tiene base de datos» es una decisión
    // declarada; «la ruta no existe» puede ser un esquema movido de sitio, y ése
    // sí merece aviso.
    paquete(dir, { dependencies: {} });
    escribir(dir, "AGENTS.md", "# Stack\n");
    const r = correr("stack", dir);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/no aplica/i);
  });

  it("informa del Node canónico cuando `engines` lo declara", () => {
    paquete(dir, { engines: { node: "^24" } });
    escribir(dir, "AGENTS.md", "# Stack\n");
    expect(correr("stack", dir).out).toMatch(/24/);
  });

  it("CAZA que un workflow use otro major de Node que `engines`", () => {
    paquete(dir, { engines: { node: "^24" } });
    escribir(dir, "AGENTS.md", "# Stack\n");
    escribir(dir, ".github/workflows/ci.yml", "jobs:\n  a:\n    steps:\n      - uses: actions/setup-node@v5\n        with:\n          node-version: 18\n");
    const r = correr("stack", dir);
    expect(r.code, "el runner probaría un runtime que nadie va a desplegar").toBe(1);
    expect(r.out + r.err).toMatch(/18/);
  });

  it("no revienta sin `.github/` ni `AGENTS.md`", () => {
    // Degradación: un proyecto recién creado no tiene ninguna de las dos cosas, y
    // un guardrail que muere ahí es un guardrail que nadie adopta.
    paquete(dir, {});
    expect(correr("stack", dir).code).toBe(0);
  });
});
