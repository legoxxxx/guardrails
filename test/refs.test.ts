// ─── refs — las rutas que la documentación cita existen ──────────────────────
//
// Una ruta rota dentro de una instrucción no es un enlace muerto: es una orden
// que nadie puede cumplir.
//
// La mitad de estas pruebas cubre los ESCAPES, y no por completismo: el ruido es
// el modo de fallo real de este comando. Con 33 avisos nadie mira, y los tres
// que eran señal quedan enterrados — pasó el 2026-08-25 y motivó el patrón de
// `docs/audits/archive/`.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { crearFixture, borrar, escribir, paquete, correr } from "./ayudantes";

const CFG = JSON.stringify({
  refs: { docs: ["docs"], roots: ["docs/", "src/"], historical: ["^docs/audits/archive/"] },
});

let dir: string;
beforeEach(() => {
  dir = crearFixture("refs");
  paquete(dir);
  escribir(dir, "guardrails.config.json", CFG);
});
afterEach(() => borrar(dir));

describe("refs", () => {
  it("pasa cuando lo citado existe", () => {
    escribir(dir, "src/a.ts", "export const a = 1;\n");
    escribir(dir, "docs/guia.md", "Mira `src/a.ts` para el detalle.\n");
    expect(correr("refs", dir).code).toBe(0);
  });

  it("reporta una ruta citada que no existe", () => {
    escribir(dir, "docs/guia.md", "Mira `src/fantasma.ts` para el detalle.\n");
    const r = correr("refs", dir);
    expect(r.out + r.err, "debe nombrar la ruta rota").toMatch(/fantasma\.ts/);
  });

  it("no reporta rutas de un documento HISTÓRICO", () => {
    // Un informe archivado audita código que desde entonces cambió: nombrar
    // rutas que ya no existen es su función, no un defecto.
    escribir(dir, "docs/audits/archive/2026-01-01-viejo.md", "Se tocó `src/borrado.ts`.\n");
    const r = correr("refs", dir);
    expect(r.out + r.err).not.toMatch(/borrado\.ts/);
  });

  it("no reporta lo que un tramo declara como ejemplo", () => {
    escribir(
      dir,
      "docs/arq.md",
      "Real: nada.\n\n<!-- check-refs: ejemplos-desde -->\n\nNo crees `src/futuro.ts`.\n\n<!-- check-refs: ejemplos-hasta -->\n",
    );
    const r = correr("refs", dir);
    expect(r.out + r.err).not.toMatch(/futuro\.ts/);
  });

  it("el marcador de archivo entero NO se traga al de tramo", () => {
    // Regresión: el patrón permisivo del marcador de archivo casaba también
    // `ejemplos-desde`, así que acotar un tramo desactivaba el documento
    // completo — un verde que aparentaba cobertura donde ya no había.
    escribir(
      dir,
      "docs/arq.md",
      "<!-- check-refs: ejemplos-desde -->\n\n`src/ficticio.ts`\n\n<!-- check-refs: ejemplos-hasta -->\n\nY aquí: `src/roto.ts`.\n",
    );
    const r = correr("refs", dir);
    expect(r.out + r.err, "lo de fuera del tramo SÍ se comprueba").toMatch(/roto\.ts/);
  });

  it("ignora lo que no es una ruta del repositorio", () => {
    escribir(dir, "docs/guia.md", "Usa `useState` y `npm run build`, no `otro/paquete.ts`.\n");
    expect(correr("refs", dir).code).toBe(0);
  });
});
