#!/usr/bin/env node
// ─── Check Docs State — Integridad de los documentos de estado ───────────────
// Ejecutar: npm run lint:state
//
// QUÉ CUBRE, Y POR QUÉ NO BASTABA LO QUE HABÍA:
//
//   Los tres guardrails existentes vigilan cosas distintas y ninguno ve esto:
//
//     · `check-prompts.mjs` → inventario de `docs/prompts/` (huérfanos, fantasmas).
//     · `check-refs.mjs`    → que las rutas citadas EXISTAN.
//     · `check-sync.mjs`    → estado vs política de sincronización con megadatos.
//
//   El 2026-07-29 se descubrió que `session-wrapup.md` prohibía `docs/DONE.md`
//   —«no hay un tercer archivo»— mientras CINCO documentos lo trataban como
//   legítimo: `INDEX.md`, `SYNC_MANIFEST.md`, `system-header.md`, `TODO.md` y el
//   whitelist de `verify-doc-links.sh`. El archivo existía, con historial de
//   marzo a mayo que el CHANGELOG no cubre. Un agente que leyera el prompt
//   habría borrado ese historial; uno que leyera `TODO.md` habría seguido
//   escribiéndolo. Los tres guardrails estaban en verde.
//
//   `check-refs.mjs` no podía detectarlo por construcción: verifica que lo
//   citado exista, no que lo PROHIBIDO no exista. Son invariantes opuestas.
//
//   Este script comprueba las invariantes de los documentos de estado que la
//   prosa declara, y muy especialmente la simétrica que faltaba: **ningún
//   documento puede prohibir un archivo que sí existe**. No contiene listas de
//   prohibiciones — las descubre por regex.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./config.mjs";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const CFG = cargar("state");
const DOCS_DIR = CFG.docs;

/**
 * Los tres documentos de estado y el trabajo de cada uno.
 *
 * La división es la que evita que vuelvan a competir: si dos archivos
 * respondieran a la misma pregunta, uno se quedaría desfasado y se convertiría
 * en fuente de verdad falsa — que es exactamente lo que motivó que `DONE.md` se
 * borrara dos veces antes de reinstaurarse.
 */
const ESTADO = CFG.estado;

const indexPath = CFG.index;
const indexBody = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
const loCitaElIndex = (archivo) => indexBody.includes(archivo);
const seExige = (archivo, def) => def.siempre || loCitaElIndex(archivo);

const errores = [];
const avisos = [];

// ─── Invariante 1 · Los documentos de estado existen ────────────────────────

for (const [archivo, def] of Object.entries(ESTADO)) {
  const ruta = join(DOCS_DIR, archivo);
  const existe = existsSync(ruta);

  if (!existe && seExige(archivo, def)) {
    const porque = def.siempre
      ? "Es un documento de estado del workspace"
      : `El INDEX.md de este proyecto lo cita, así que forma parte de su modelo de estado`;
    errores.push(`${ruta} no existe. ${porque} (${def.trabajo}).`);
  }

  // El fallo simétrico: existe pero el índice no lo nombra. Nadie lo encuentra
  // y nadie lo mantiene; es el estado previo a que alguien lo borre por inútil.
  if (existe && !def.siempre && !loCitaElIndex(archivo)) {
    avisos.push(
      `${ruta} existe pero ${indexPath} no lo cita. Un documento de estado que el índice no nombra es invisible: o se añade al índice, o se archiva a conciencia.`
    );
  }
}

// ─── Invariante 2 · TODO.md sólo contiene trabajo abierto ───────────────────
//
// Un `- [x]` en TODO.md es una tarea hecha disfrazada de pendiente: infla el
// backlog y hace que nadie se fíe de la lista. Lo completado va al CHANGELOG y
// al DONE; si el contexto de un paso cerrado importa dentro de una lista
// abierta, se escribe como nota en prosa, no como casilla marcada.

// Cuál es el documento de trabajo ABIERTO se declara con `abierto: true`.
// Cablear "TODO.md" ataba estos dos invariantes a un nombre de archivo: un
// proyecto que llame a su backlog de otra forma —o que no tenga— los saltaba
// en silencio, que es peor que no tenerlos.
const abiertoNombre = Object.entries(ESTADO).find(([, d]) => d.abierto)?.[0] ?? null;
const todoPath = abiertoNombre ? join(DOCS_DIR, abiertoNombre) : null;
if (todoPath && existsSync(todoPath)) {
  const lineas = readFileSync(todoPath, "utf8").split("\n");
  lineas.forEach((linea, i) => {
    if (/^\s*[-*]\s*\[[xX]\]/.test(linea)) {
      errores.push(`${todoPath}:${i + 1} — casilla marcada en ${abiertoNombre}: ${linea.trim().slice(0, 70)}`);
    }
  });
}

// ─── Invariante 3 · TODO.md declara dónde va lo completado ──────────────────

if (todoPath && existsSync(todoPath)) {
  const todo = readFileSync(todoPath, "utf8");
  // Los destinos son los OTROS documentos de estado declarados: adónde va lo
  // que sale del backlog. Se derivan del mapa en vez de listarse aquí.
  for (const destino of Object.keys(ESTADO).filter((n) => n !== abiertoNombre)) {
    if (!todo.includes(destino)) {
      avisos.push(
        `${todoPath} no menciona ${destino}. Sin la división escrita a la vista, los tres documentos vuelven a competir.`
      );
    }
  }
}

// ─── Invariante 4 · Nadie prohíbe un archivo que existe ─────────────────────
//
// La invariante que faltaba, y la que dejó pasar la contradicción de DONE.md.
// Se descubren las prohibiciones por redacción, no por lista: cualquier
// documento que declare que un archivo no debe existir queda sujeto a que
// realmente no exista.

const PROHIBICIONES = [
  /no\s+recrear\s+`([^`]+)`/gi,
  /no\s+debe\s+existir\s+`([^`]+)`/gi,
  /`([^`]+)`\s+no\s+debe\s+existir/gi,
  /no\s+volver\s+a\s+crear\s+`([^`]+)`/gi,
];

function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = existsSync(DOCS_DIR) ? markdownFiles(DOCS_DIR) : [];
let prohibicionesVistas = 0;

for (const file of files) {
  const contenido = readFileSync(file, "utf8");
  for (const patron of PROHIBICIONES) {
    for (const match of contenido.matchAll(patron)) {
      const ruta = match[1].trim();
      // Sólo interesan rutas del repositorio, no nombres de concepto.
      if (!/^(docs|src|prisma|scripts|public|\.github)\//.test(ruta)) continue;
      prohibicionesVistas++;
      if (existsSync(ruta)) {
        errores.push(
          `${file} declara que \`${ruta}\` no debe existir, pero existe. Una de las dos cosas está mal: o se borra el archivo, o se deroga la prohibición.`
        );
      }
    }
  }
}

// ─── Informe ────────────────────────────────────────────────────────────────

console.log("════════════════════════════════════════════════════════════════");
console.log(`${YELLOW}Documentos de estado${NC}`);
for (const [archivo, def] of Object.entries(ESTADO)) {
  const ok = existsSync(join(DOCS_DIR, archivo));
  // Ausente y no exigido no es un fallo: este proyecto simplemente no usa ese
  // documento. Marcarlo en rojo confundiría «no aplica» con «está roto».
  const marca = ok ? `${GREEN}✔${NC}` : seExige(archivo, def) ? `${RED}✖${NC}` : `${DIM}–${NC}`;
  const nota = ok || seExige(archivo, def) ? def.trabajo : `${def.trabajo} — no usado en este proyecto`;
  console.log(`  ${marca} ${archivo.padEnd(14)} ${DIM}${nota}${NC}`);
}
console.log(`  ${DIM}Archivos analizados:${NC} ${files.length}`);
console.log(`  ${DIM}Prohibiciones declaradas y comprobadas:${NC} ${prohibicionesVistas}\n`);

if (avisos.length) {
  console.log(`${YELLOW}⚠️  ${avisos.length} avisos${NC}`);
  avisos.forEach((a) => console.log(`     ${YELLOW}·${NC} ${a}`));
  console.log("");
}

if (errores.length) {
  console.log(`${RED}❌ ${errores.length} contradicciones entre la prosa y el disco${NC}\n`);
  errores.forEach((e) => console.log(`     ${RED}✖${NC} ${e}`));
  console.log("\n════════════════════════════════════════════════════════════════");
  process.exit(1);
}

console.log(`${GREEN}✅ La prosa y el disco dicen lo mismo${NC}`);
console.log("════════════════════════════════════════════════════════════════");
