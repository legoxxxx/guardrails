#!/usr/bin/env node
// ─── Check Worktree — Estado del árbol frente al resto del mundo ─────────────
// Ejecutar: npm run lint:worktree
//           npm run lint:worktree -- --fetch        (refresca antes de medir)
//           npm run lint:worktree -- --max-dirty=40 (sube el umbral de la tanda)
// Ref: docs/processes/PARALLEL_WORK.md §5 (R1, R2, R7)
//
// QUÉ CUBRE, Y POR QUÉ NO BASTABA LO QUE HABÍA:
//
//   Los cuatro guardrails existentes miran el CONTENIDO del repositorio y
//   ninguno mira su POSICIÓN:
//
//     · `check-prompts.mjs`    → inventario de `docs/prompts/`.
//     · `check-refs.mjs`       → que las rutas citadas existan.
//     · `check-docs-state.mjs` → que nadie prohíba un archivo que existe.
//     · `check-sync.mjs`       → estado vs política frente al proyecto par.
//
//   Los cuatro pueden estar en verde sobre una copia parada semanas, y lo
//   estuvieron. El 2026-08-04 esta copia llevaba 46 commits de retraso: otra
//   instancia había empujado cuatro guardrails el 2026-07-29 y esta sesión los
//   volvió a escribir desde cero, sin `fetch` previo. Cuatro archivos creados
//   como nuevos que ya existían arriba, y ~210 líneas de divergencia que hubo
//   que fusionar a mano en 55 conflictos.
//
//   Ningún guardrail podía verlo por construcción: todos leen el disco, y en el
//   disco no estaba el problema. El problema era la distancia a `origin`.
//
//   Este script mide esa distancia. Es F1, F2 y F4 de PARALLEL_WORK.md
//   convertidos en un check de milisegundos.
//
//   NO contiene ninguna lista de archivos ni de ramas: todo se descubre
//   preguntándole a git.
// ────────────────────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const args = process.argv.slice(2);
const HACER_FETCH = args.includes("--fetch");
const MAX_DIRTY = Number(args.find((a) => a.startsWith("--max-dirty="))?.slice(12) ?? 30);
// Por encima de esto el árbol deja de ser «una sesión en curso» y pasa a ser una
// fusión pendiente que crece (R7). El umbral no es sagrado; el que estaba abierto
// el 2026-08-04 eran 55 archivos en cada proyecto, a la vez.
const AVISO_DIRTY = Math.max(5, Math.floor(MAX_DIRTY / 3));
// Un `rev-list` contra un remote-tracking ref viejo mide contra un pasado. Media
// hora es lo que tarda otra instancia en empujar una tanda entera.
const FETCH_VIEJO_MIN = 30;

const errores = [];
const avisos = [];

function git(...cmd) {
  return execFileSync("git", cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitSeguro(...cmd) {
  try {
    return git(...cmd);
  } catch {
    return null;
  }
}

if (gitSeguro("rev-parse", "--is-inside-work-tree") !== "true") {
  console.log(`${RED}❌ Esto no es un repositorio git${NC}`);
  process.exit(1);
}

// ─── Contexto ───────────────────────────────────────────────────────────────

const rama = gitSeguro("rev-parse", "--abbrev-ref", "HEAD");
const upstream = gitSeguro("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}");
const worktrees = (gitSeguro("worktree", "list") ?? "").split("\n").filter(Boolean);

// ─── C1 · Frescura de la medición ───────────────────────────────────────────
//
// Va primero porque condiciona a C2: comparar con un `origin/x` que se buscó
// hace tres días no dice dónde está `origin/x`, dice dónde estaba.

let minutosDesdeFetch = null;
if (HACER_FETCH) {
  try {
    git("fetch", "--all", "--prune", "--quiet");
    minutosDesdeFetch = 0;
  } catch {
    avisos.push("`git fetch` falló (¿sin red?). La medición de C2 es la del último fetch conocido.");
  }
} else {
  const gitDir = gitSeguro("rev-parse", "--git-dir");
  const marca = gitDir ? `${gitDir}/FETCH_HEAD` : null;
  if (marca && existsSync(marca)) {
    minutosDesdeFetch = Math.floor((Date.now() - statSync(marca).mtimeMs) / 60000);
    if (minutosDesdeFetch > FETCH_VIEJO_MIN) {
      avisos.push(
        `El último \`git fetch\` fue hace ${minutosDesdeFetch} min. C2 está midiendo contra ese momento, ` +
          `no contra ahora — relanza con \`-- --fetch\`.`
      );
    }
  } else {
    avisos.push("Nunca se ha hecho `fetch` en esta copia: C2 no puede medir nada. Relanza con `-- --fetch`.");
  }
}

// ─── C2 · Retraso frente al upstream ────────────────────────────────────────

let adelante = null;
let atras = null;
if (!upstream) {
  avisos.push(
    `La rama \`${rama}\` no tiene upstream configurado. Sin él no hay con qué comparar: ` +
      `\`git branch --set-upstream-to=origin/${rama}\`.`
  );
} else {
  const cuenta = gitSeguro("rev-list", "--left-right", "--count", `HEAD...${upstream}`);
  if (cuenta) {
    [adelante, atras] = cuenta.split(/\s+/).map(Number);
    if (atras > 0) {
      errores.push(
        `HEAD está ${atras} commit(s) por detrás de \`${upstream}\`. **Actualiza antes de escribir una línea** ` +
          `(R1). Trabajar sobre una copia parada es lo que produjo la duplicación del 2026-08-04.`
      );
    }
  }
}

// ─── C3 · Archivos «nuevos» que ya existen arriba ───────────────────────────
//
// El accidente exacto: cuatro guardrails reescritos desde cero sobre archivos
// que `origin` ya tenía. Se comprueba contra el upstream, no contra HEAD: el
// punto es justamente que HEAD puede no tenerlos todavía.

const untracked = (gitSeguro("ls-files", "--others", "--exclude-standard") ?? "")
  .split("\n")
  .filter(Boolean);

const yaExisten = [];
if (upstream) {
  for (const ruta of untracked) {
    if (gitSeguro("cat-file", "-e", `${upstream}:${ruta}`) !== null) yaExisten.push(ruta);
  }
}
if (yaExisten.length) {
  errores.push(
    `${yaExisten.length} archivo(s) figuran aquí como nuevos y **ya existen en \`${upstream}\`**. ` +
      `Hereda, no reescribas (R2):\n` +
      yaExisten.map((r) => `         · ${r}`).join("\n")
  );
}

// ─── C4 · Volumen sin commitear ─────────────────────────────────────────────

const sucios = (gitSeguro("status", "--short") ?? "").split("\n").filter(Boolean);
if (sucios.length > MAX_DIRTY) {
  errores.push(
    `${sucios.length} archivos sin commitear (umbral ${MAX_DIRTY}). Eso ya no es una sesión en curso, ` +
      `es una fusión pendiente que crece (R7). Pártelo en commits o sube el umbral a conciencia ` +
      `con \`-- --max-dirty=N\`.`
  );
} else if (sucios.length > AVISO_DIRTY) {
  avisos.push(`${sucios.length} archivos sin commitear. La rama debería vivir horas, no días (R7).`);
}

// ─── C5 · Marcadores de conflicto olvidados ─────────────────────────────────
//
// Informativa pero barata: un `<<<<<<<` que sobrevive a una fusión se cuela en
// el commit y nadie lo ve hasta que alguien lee el archivo.

const conMarcadores = (gitSeguro("grep", "-l", "-e", "^<<<<<<< ", "-e", "^>>>>>>> ") ?? "")
  .split("\n")
  .filter(Boolean);
if (conMarcadores.length) {
  errores.push(
    `${conMarcadores.length} archivo(s) conservan marcadores de conflicto sin resolver:\n` +
      conMarcadores.map((r) => `         · ${r}`).join("\n")
  );
}

// ─── Informe ────────────────────────────────────────────────────────────────

const rel = (n) => (n === null ? `${DIM}—${NC}` : n === 0 ? `${GREEN}0${NC}` : `${YELLOW}${n}${NC}`);

console.log("════════════════════════════════════════════════════════════════");
console.log(`${YELLOW}Posición del árbol${NC}`);
console.log(`  ${DIM}Rama:${NC}            ${rama}${upstream ? `  ${DIM}→ ${upstream}${NC}` : ""}`);
console.log(`  ${DIM}Commits propios:${NC} ${rel(adelante)}   ${DIM}· sin empujar${NC}`);
console.log(`  ${DIM}Commits arriba:${NC}  ${atras === null ? `${DIM}—${NC}` : atras === 0 ? `${GREEN}0${NC}` : `${RED}${atras}${NC}`}   ${DIM}· sin integrar${NC}`);
console.log(`  ${DIM}Sin commitear:${NC}   ${rel(sucios.length)}   ${DIM}· ${untracked.length} sin trackear${NC}`);
console.log(
  `  ${DIM}Último fetch:${NC}    ${minutosDesdeFetch === null ? `${DIM}nunca${NC}` : `hace ${minutosDesdeFetch} min`}`
);
console.log(`  ${DIM}Árboles vivos:${NC}   ${worktrees.length}${worktrees.length > 1 ? `   ${DIM}· hay otra instancia aislada (escenario B/D)${NC}` : ""}`);
if (worktrees.length > 1) worktrees.forEach((w) => console.log(`     ${DIM}${w}${NC}`));
console.log("");

if (avisos.length) {
  console.log(`${YELLOW}⚠️  ${avisos.length} aviso(s)${NC}`);
  avisos.forEach((a) => console.log(`     ${YELLOW}·${NC} ${a}`));
  console.log("");
}

if (errores.length) {
  console.log(`${RED}❌ ${errores.length} problema(s) de posición${NC}\n`);
  errores.forEach((e) => console.log(`     ${RED}✖${NC} ${e}`));
  console.log("\n════════════════════════════════════════════════════════════════");
  process.exit(1);
}

console.log(`${GREEN}✅ El árbol está donde debe: al día, sin duplicados y sin tanda colgando${NC}`);
console.log("════════════════════════════════════════════════════════════════");
