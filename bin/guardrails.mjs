#!/usr/bin/env node
// ─── guardrails — despachador ────────────────────────────────────────────────
// Ejecutar:  npx guardrails <comando> [opciones]
//
// POR QUÉ ESTE ARCHIVO ES TAN FINO, Y POR QUÉ IMPORTA
//
//   Los módulos de `src/` son **copias byte a byte** de los guardrails que
//   vivían en `scripts/` de cada proyecto. No se han reescrito, ni reindentado,
//   ni «mejorado de paso». Esa identidad es lo que permite demostrar que la
//   extracción no cambió nada: se compara la salida de los dos y tiene que ser
//   la misma sobre el mismo repositorio.
//
//   Una extracción que además refactoriza no se puede verificar: si la salida
//   difiere, no hay forma de saber si fue el traslado o la mejora. Primero se
//   traslada y se demuestra; mejorar es otro commit.
//
// POR QUÉ SE MUTA `process.argv` EN VEZ DE PASAR ARGUMENTOS
//
//   Los módulos leen `process.argv.slice(2)` por su cuenta, como scripts que
//   eran. Si se les invoca a través de un subcomando, ese subcomando aparecería
//   como primer argumento y contaminaría su parseo: `surface` interpreta
//   posicionales, así que `guardrails surface --range a..b` le llegaría como
//   `["surface", "--range", ...]` y leería mal.
//
//   Quitar el subcomando de `process.argv` antes de importar deja a cada módulo
//   viendo exactamente lo que veía como script suelto. La alternativa —cambiar
//   los módulos para aceptar `argv` por parámetro— rompe la identidad byte a
//   byte, que es justo lo que hace auditable esta extracción.
// ────────────────────────────────────────────────────────────────────────────

const COMANDOS = {
  worktree: {
    modulo: "../src/worktree.mjs",
    resumen: "Estado del árbol frente a origin: posición, limpieza, frescura del fetch",
    opciones: ["--fetch            refresca antes de medir", "--max-dirty=<n>    umbral de archivos sin commitear (por defecto 30)"],
  },
  surface: {
    modulo: "../src/surface.mjs",
    resumen: "El diff cuadra con la superficie que el commit declaró en su trailer",
    opciones: ["--message <ruta>   comprueba el mensaje en curso (hook commit-msg)", "--range <a>..<b>   comprueba un rango en vez de HEAD"],
  },
};

const RED = "\x1b[0;31m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

function ayuda() {
  console.log("\nguardrails — comprobaciones portables, sin nada específico de un proyecto\n");
  console.log("  Uso:  npx guardrails <comando> [opciones]\n");
  for (const [nombre, { resumen, opciones }] of Object.entries(COMANDOS)) {
    console.log(`  ${nombre.padEnd(10)} ${resumen}`);
    for (const o of opciones) console.log(`             ${DIM}${o}${NC}`);
  }
  console.log("");
}

const comando = process.argv[2];

if (!comando || comando === "--help" || comando === "-h") {
  ayuda();
  process.exit(comando ? 0 : 1);
}

if (comando === "--version" || comando === "-v") {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const pkg = fileURLToPath(new URL("../package.json", import.meta.url));
  console.log(JSON.parse(readFileSync(pkg, "utf8")).version);
  process.exit(0);
}

if (!Object.hasOwn(COMANDOS, comando)) {
  console.error(`\n  ${RED}✖ Comando desconocido: ${comando}${NC}`);
  ayuda();
  process.exit(1);
}

// El subcomando desaparece de la vista del módulo. Ver la cabecera.
process.argv = [process.argv[0], process.argv[1], ...process.argv.slice(3)];

await import(COMANDOS[comando].modulo);
