// ─── nul — que un archivo de texto siga siendo texto ─────────────────────────
//
// Las pruebas son de MUTACIÓN: cada una inyecta el defecto que el guardrail dice
// prevenir y comprueba que lo caza. Una suite que sólo comprobara el caso bueno
// pasaría en verde con el guardrail desactivado, que es justo el modo de fallo
// que este paquete persigue.
//
// El byte se construye con `String.fromCharCode(0)` y no se escribe literal: un
// NUL dentro de este archivo lo convertiría en binario para `git` y `grep`, que
// es exactamente el defecto que el guardrail probado existe para cazar.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crearFixture, borrar, escribir, paquete, correr } from "./ayudantes";

const NUL = String.fromCharCode(0);

let dir: string;
beforeEach(() => {
  dir = crearFixture("nul");
  paquete(dir);
  escribir(dir, "guardrails.config.json", JSON.stringify({ nul: { scan: ["docs"] } }));
});
afterEach(() => borrar(dir));

describe("nul", () => {
  it("pasa cuando todo el texto es texto", () => {
    escribir(dir, "docs/a.md", "# Título\n\nProsa normal.\n");
    expect(correr("nul", dir).code).toBe(0);
  });

  it("CAZA un byte NUL escondido en markdown", () => {
    escribir(dir, "docs/a.md", Buffer.from(`# Título\n\nantes${NUL}después\n`, "utf8"));
    const r = correr("nul", dir);
    expect(r.code, "un archivo con NUL debe romper la puerta").toBe(1);
    expect(r.out + r.err).toMatch(/docs\/a\.md/);
  });

  it("no confunde texto acentuado con bytes binarios", () => {
    // Regresión: la ñ y las tildes son multibyte en UTF-8. Un guardrail que
    // mirase «bytes altos» en vez del NUL exacto los daría por binarios, y este
    // proyecto escribe toda su documentación en español.
    escribir(dir, "docs/a.md", "Año, decisión, ñu, «comillas», em—dash.\n");
    expect(correr("nul", dir).code).toBe(0);
  });

  it("no mira fuera de lo que declara `nul.scan`", () => {
    escribir(dir, "otro/a.md", Buffer.from(`x${NUL}y`, "utf8"));
    expect(correr("nul", dir).code, "sólo vigila `docs/` en este fixture").toBe(0);
  });
});
