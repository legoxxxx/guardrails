// ─── stack — el stack documentado existe de verdad ───────────────────────────
//
// Existe porque una tabla de stack miente sin que nadie lo note, y la mentira no
// es inofensiva: un proyecto afirmó durante meses usar una librería de caché que
// no tenía una sola llamada en `src/`, y esa afirmación BLINDÓ la dependencia
// frente a la auditoría que sí eliminó otras.
// ────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crearFixture, borrar, escribir, paquete, correr } from "./ayudantes";

const CFG = JSON.stringify({
  stack: { ambito: ["AGENTS.md"], workflows: ".github/workflows", schema: null },
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

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

// ─── Homónimos declarados ────────────────────────────────────────────────────
//
// `shadcn` es el CLI de scaffolding; `shadcn/ui` es un sistema de componentes
// cuyo código se copia al repositorio. Al desinstalar el CLI, diez citas
// correctas al segundo pasaron a bloquear en un proyecto real: el guardrail
// buscaba el nombre como subcadena y no sabía que eran cosas distintas.
describe("stack · homónimos", () => {
  /** Un repositorio donde `shadcn` estuvo instalado y ya no está. */
  const conRetirada = (d: string) => {
    git(d, "init", "-q", "-b", "main");
    git(d, "config", "user.email", "t@t.t");
    git(d, "config", "user.name", "T");
    paquete(d, { devDependencies: { shadcn: "^4.13.0" } });
    git(d, "add", "package.json");
    git(d, "commit", "-q", "-m", "con el CLI");
    paquete(d, { devDependencies: {} });
    git(d, "add", "package.json");
    git(d, "commit", "-q", "-m", "fuera el CLI");
  };

  const cfg = (homonimos: unknown) =>
    JSON.stringify({
      stack: { ambito: ["AGENTS.md"], workflows: ".github/workflows", schema: null, homonimos },
    });

  it("sin declarar nada, una cita a `shadcn/ui` bloquea — el defecto que motivó esto", () => {
    conRetirada(dir);
    escribir(dir, "AGENTS.md", "# Stack\n\nLos componentes de shadcn/ui van en `src/components/ui/`.\n");
    expect(correr("stack", dir).code).toBe(1);
  });

  it("declarado, la cita deja de bloquear y la exención se ve en la salida", () => {
    conRetirada(dir);
    escribir(
      dir,
      "guardrails.config.json",
      cfg({ shadcn: { formas: ["shadcn/ui"], motivo: "El CLI se ejecuta con npx; shadcn/ui se copia" } }),
    );
    escribir(dir, "AGENTS.md", "# Stack\n\nLos componentes de shadcn/ui van en `src/components/ui/`.\n");
    const r = correr("stack", dir);
    expect(r.code).toBe(0);
    // El motivo se imprime: una exención que no se ve es una que nadie revisa.
    expect(r.out).toMatch(/exentas por homónimo/i);
    expect(r.out).toMatch(/se ejecuta con npx/);
  });

  it("NO ciega al guardrail: el paquete a secas sigue bloqueando", () => {
    // Es la prueba que de verdad importa. Tapar `shadcn/ui` no puede convertirse
    // en tapar `shadcn`, o la exención habría cambiado un falso positivo por un
    // falso negativo — el intercambio que este guardrail rechaza por diseño.
    conRetirada(dir);
    escribir(
      dir,
      "guardrails.config.json",
      cfg({ shadcn: { formas: ["shadcn/ui"], motivo: "El CLI se ejecuta con npx; shadcn/ui se copia" } }),
    );
    escribir(dir, "AGENTS.md", "# Stack\n\n| Pieza | Nota |\n| --- | --- |\n| `shadcn` | El CLI |\n");
    expect(correr("stack", dir).code).toBe(1);
  });

  it("declarar un homónimo SIN motivo es un error de configuración", () => {
    conRetirada(dir);
    escribir(dir, "guardrails.config.json", cfg({ shadcn: { formas: ["shadcn/ui"] } }));
    escribir(dir, "AGENTS.md", "# Stack\n");
    const r = correr("stack", dir);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/motivo/i);
  });

  it("declarar `formas` vacías también lo es", () => {
    conRetirada(dir);
    escribir(dir, "guardrails.config.json", cfg({ shadcn: { formas: [], motivo: "por qué" } }));
    escribir(dir, "AGENTS.md", "# Stack\n");
    expect(correr("stack", dir).code).toBe(1);
  });
});
