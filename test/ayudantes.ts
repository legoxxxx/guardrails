// ─── Ayudantes compartidos de las suites ─────────────────────────────────────
//
// Cada comando se prueba como lo que es: un proceso que corre en un directorio y
// sale con 0 o 1. Nada de importar el módulo y espiar funciones — eso probaría
// una versión del guardrail que nadie ejecuta.
//
// POR QUÉ `spawnSync` Y NO `execFileSync`:
//
//   `execFileSync` se queda sólo con stdout y lanza en cuanto el código de salida
//   no es 0, así que un guardrail que MUERE con una excepción y otro que falla
//   correctamente se ven idénticos desde el test. Son cosas muy distintas:
//   `spawnSync` da las tres —salida, error y código— y permite distinguirlas.
// ────────────────────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const CRASH_DE_NODE = /^Node\.js v\d/m;

export type Salida = { code: number; out: string; err: string };

/** Un directorio de trabajo desechable. El llamador lo borra en `afterAll`. */
export function crearFixture(prefijo: string): string {
  return mkdtempSync(join(tmpdir(), `guardrails-${prefijo}-`));
}

export const borrar = (dir: string) => rmSync(dir, { recursive: true, force: true });

/** Escribe un archivo creando su ruta. El contenido puede ser texto o bytes. */
export function escribir(dir: string, rel: string, contenido: string | Buffer): void {
  const ruta = join(dir, rel);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
}

/** `package.json` mínimo: casi todos los comandos lo leen. */
export function paquete(dir: string, extra: Record<string, unknown> = {}): void {
  escribir(dir, "package.json", JSON.stringify({ name: "fixture", ...extra }, null, 2));
}

/**
 * Ejecuta un comando del paquete dentro del fixture.
 *
 * Si el proceso muere con una excepción no capturada, se lanza aquí con el error
 * completo: un stack de Node no es un veredicto, y un test que lo lea como
 * «falló, luego cazó el defecto» daría por buena una puerta rota.
 */
export function correr(comando: string, dir: string, args: string[] = []): Salida {
  // Se ejecuta el DESPACHADOR, no `src/<comando>.mjs` directamente: es la vía
  // por la que se le invoca de verdad, y la única que comprueba que el mapa de
  // comandos apunta a un módulo que existe. Con la ruta cableada, renombrar un
  // archivo de `src/` dejaba los tests en verde y el binario roto — pasó al
  // renombrar `nul.mjs`, que en Windows es un nombre de dispositivo reservado.
  const bin = resolve(process.cwd(), "bin/guardrails.mjs");
  const r = spawnSync("node", [bin, comando, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "", NO_COLOR: "1" },
  });
  const salida: Salida = {
    code: r.status ?? 1,
    out: (r.stdout ?? "").replace(ANSI, ""),
    err: (r.stderr ?? "").replace(ANSI, ""),
  };
  if (CRASH_DE_NODE.test(salida.err)) {
    throw new Error(
      `${comando}.mjs murió con una excepción no capturada (exit ${salida.code}).\n` +
        `Eso NO es cazar un defecto: es el guardrail roto.\n\n${salida.err}`,
    );
  }
  return salida;
}
