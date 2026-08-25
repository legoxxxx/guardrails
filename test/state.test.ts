// ─── state — la prosa y el disco dicen lo mismo ──────────────────────────────
//
// Su invariante más valiosa es la simétrica y la que suele faltar: **ningún
// documento puede prohibir un archivo que existe**. Verificar que lo citado
// existe y verificar que lo prohibido no existe son invariantes opuestas, y la
// primera no puede detectar la segunda.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crearFixture, borrar, escribir, paquete, correr } from "./ayudantes";

const SIN_ESTADO = JSON.stringify({ state: { estado: {} } });
const CON_BACKLOG = JSON.stringify({
  state: { estado: { "TODO.md": { trabajo: "sólo trabajo abierto", siempre: true, abierto: true } } },
});

let dir: string;
beforeEach(() => {
  dir = crearFixture("state");
  paquete(dir);
});
afterEach(() => borrar(dir));

describe("state", () => {
  it("pasa sin documentos de estado y sin prohibiciones", () => {
    escribir(dir, "guardrails.config.json", SIN_ESTADO);
    escribir(dir, "docs/a.md", "Prosa sin prohibiciones.\n");
    expect(correr("state", dir).code).toBe(0);
  });

  it("CAZA un documento que prohíbe un archivo que existe", () => {
    escribir(dir, "guardrails.config.json", SIN_ESTADO);
    escribir(dir, "docs/regla.md", "No recrear `docs/viejo.md`: se retiró en la v2.\n");
    escribir(dir, "docs/viejo.md", "pero aquí sigo\n");
    const r = correr("state", dir);
    expect(r.code, "la prosa prohíbe algo que existe: contradicción").toBe(1);
    expect(r.out + r.err).toMatch(/viejo\.md/);
  });

  it("no inventa contradicción si lo prohibido de verdad no existe", () => {
    escribir(dir, "guardrails.config.json", SIN_ESTADO);
    escribir(dir, "docs/regla.md", "No recrear `docs/viejo.md`: se retiró en la v2.\n");
    expect(correr("state", dir).code).toBe(0);
  });

  it("CAZA que falte un documento de estado declarado obligatorio", () => {
    escribir(dir, "guardrails.config.json", CON_BACKLOG);
    escribir(dir, "docs/otro.md", "x\n");
    expect(correr("state", dir).code, "TODO.md se declara obligatorio y no está").toBe(1);
  });

  it("CAZA una casilla marcada en el backlog", () => {
    // Una tarea hecha disfrazada de pendiente infla el backlog y hace que nadie
    // se fíe de la lista.
    escribir(dir, "guardrails.config.json", CON_BACKLOG);
    escribir(dir, "docs/TODO.md", "# TODO\n\n- [x] esto ya está hecho\n");
    expect(correr("state", dir).code).toBe(1);
  });

  it("con `estado: {}` sigue en pie el invariante genérico", () => {
    // Es lo que hace útil el comando en un proyecto que no usa documentos de
    // estado: los invariantes que dependen de ellos se saltan, ése no.
    escribir(dir, "guardrails.config.json", SIN_ESTADO);
    escribir(dir, "docs/r.md", "`docs/x.md` no debe existir.\n");
    escribir(dir, "docs/x.md", "existo\n");
    expect(correr("state", dir).code).toBe(1);
  });
});
