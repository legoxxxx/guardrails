#!/usr/bin/env node
// ─── Check NUL — Que un archivo de texto siga siendo texto ───────────────────
// Ejecutar: npm run lint:nul
//
// POR QUÉ EXISTE (2026-08-12):
//
//   Un solo byte NUL convierte un archivo de texto en binario, y las dos
//   consecuencias son silenciosas:
//
//     1. `git` deja de poder mostrarlo. `git show` dice `Bin 0 -> N bytes` y el
//        archivo no se puede revisar en un diff, ni en un PR, ni en `git log -p`.
//     2. `grep -rn` lo salta sin avisar. Cualquier barrido —incluida una
//        auditoría— obtiene un falso negativo.
//
//   Pasó dos veces el mismo día. `scripts/check-api-reference.mjs` nació así en
//   `134a06f`: 221 líneas ilegibles en diff, y son las que vigilan los permisos
//   documentados de 171 Server Actions. Y la clase se reintrodujo en
//   `docs/TODO.md` al redactar el ítem que proponía quitarlos.
//
//   Los siete guardrails existentes dieron verde a las dos veces: todos leen
//   con `node:fs`, y a Node el byte no le molesta. Se descubrió por accidente.
//
// POR QUÉ NO ES UN `grep` DE UNA LÍNEA, que era la salida que proponía el ítem:
//
//   `grep -rlP '\x00'` NO es fiable y falla en silencio, que es el peor modo.
//   Medido el 2026-08-12: con `ugrep` 7.5.0 (el `grep` de la máquina de
//   desarrollo) no lista el archivo sin `-a`, porque lo trata como binario y
//   suprime la salida — daba verde sobre un archivo con NUL dentro. El
//   comportamiento además depende de la implementación: GNU grep en
//   `ubuntu-latest` no es el mismo programa. Un guardrail cuyo veredicto cambia
//   según la máquina no sirve para lo que existe.
//
//   Node se comporta igual en las dos, y es lo que ya usan los otros ocho.
//
// QUÉ **NO** COMPRUEBA, para que nadie lo dé por cubierto:
//
//   Sólo el byte NUL (`0x00`). NO el resto de caracteres de control invisibles
//   —`0x01`, `0x08`…—, y es deliberado: **el NUL es el único que produce el
//   defecto**. Medido el 2026-08-12 sobre `docs/DONE.md:1577`, que lleva un
//   `0x08` dentro de una ruta de Windows: `git` lo sigue tratando como texto y
//   `grep` lo lee normal. Un control suelto corrompe lo que se lee —esa ruta
//   está partida— pero eso es materia de `docs-audit`, no de este guardrail.
//
//   Ampliarlo a todo `[\x00-\x1F]` tampoco saldría gratis: los ocho scripts de
//   `scripts/` llevan secuencias ANSI, y bastaría un ESC literal para volver
//   ruidoso un check que hoy es exacto.
//
// ⚠️ SIN DEPENDENCIAS, A PROPÓSITO. El job `Docs` de CI no ejecuta `npm ci`
// (ver la cabecera de `.github/workflows/docs.yml`), así que este script corre
// sin `node_modules`. Sólo puede usar `node:fs` y `node:path`.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { cargar } from "./config.mjs";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

// Directorios donde todo debe ser texto. `src/` y `public/` quedan fuera a
// propósito: ahí viven los favicons y las imágenes de la tienda, que son
// binarios legítimos y numerosos.
const RAICES = cargar("nul").scan;

// Extensiones donde un binario es legítimo. Hoy NINGUNA aparece bajo las raíces
// de arriba —el informe lo mide y lo dice— pero un diagrama en `docs/` es
// plausible, y sin esta lista el job se pondría rojo por algo correcto.
const BINARIO_OK = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2",
]);

const NUL = 0;

/** @param {string} dir @returns {string[]} */
function recorrer(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === ".git") continue;
      salida.push(...recorrer(ruta));
    } else if (entrada.isFile()) {
      salida.push(ruta);
    }
  }
  return salida;
}

const infectados = [];
let analizados = 0;
let saltados = 0;

for (const raiz of RAICES) {
  if (!existsSync(raiz)) continue;
  for (const archivo of recorrer(raiz)) {
    if (BINARIO_OK.has(extname(archivo).toLowerCase())) {
      saltados++;
      continue;
    }
    analizados++;

    const buf = readFileSync(archivo);
    const pos = buf.indexOf(NUL);
    if (pos === -1) continue;

    // La línea, para que el informe se pueda accionar sin abrir el archivo.
    const linea = buf.subarray(0, pos).toString("utf8").split("\n").length;
    let total = 0;
    for (let i = 0; i < buf.length; i++) if (buf[i] === NUL) total++;

    infectados.push({ archivo, linea, total });
  }
}

// ─── Informe ────────────────────────────────────────────────────────────────

console.log("════════════════════════════════════════════════════════════════");
console.log(`${YELLOW}Archivos de texto con bytes NUL${NC}`);
console.log(`  ${DIM}Raíces:${NC} ${RAICES.join(", ")}`);
console.log(`  ${DIM}Archivos analizados:${NC} ${analizados}`);
console.log(`  ${DIM}Binarios legítimos saltados:${NC} ${saltados}\n`);

if (infectados.length) {
  console.log(`${RED}❌ ${infectados.length} archivo(s) de texto que ya no son texto${NC}`);
  console.log(`${DIM}   No se pueden revisar en un diff y \`grep -rn\` los salta sin avisar.${NC}\n`);
  for (const i of infectados) {
    const veces = i.total === 1 ? "1 byte NUL" : `${i.total} bytes NUL`;
    console.log(`     ${RED}✖${NC} ${i.archivo}${DIM}:${i.linea}${NC}  ${veces}`);
  }
  console.log(`\n${DIM}   Salida: escribir el carácter ESCAPADO (\\u0001) en vez de literal.${NC}`);
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(1);
}

console.log(`${GREEN}✅ Todo lo que debe ser texto lo sigue siendo${NC}`);
console.log("════════════════════════════════════════════════════════════════");
