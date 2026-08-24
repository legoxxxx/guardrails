#!/usr/bin/env node
// ─── Check Refs — Integridad de las rutas citadas en la documentación ────────
// Ejecutar: npm run lint:refs
//
// QUÉ CUBRE, Y POR QUÉ NO BASTABA LO QUE HABÍA:
//
//   `docs/scripts/verify-doc-links.sh` valida los enlaces markdown —`[texto](./x.md)`—
//   y sólo esos. Pero el orquestador y los prompts NO citan sus archivos como
//   enlaces: los citan entre comillas invertidas, como rutas.
//
//       | 🔴 Crítica | `prisma/schema.prisma` | Estado destino |
//       Ref detallada: `docs/architecture/PATTERNS.md`
//       Lógica en `src/server/services/_helpers/sale-credit.ts`
//
//   Ninguna de esas referencias se comprobaba. Un archivo renombrado o movido
//   dejaba al agente buscando algo que no existe, y el guardrail seguía verde.
//
//   Este script recorre `docs/**/*.md` y verifica que cada ruta citada apunte a
//   algo real. No contiene ninguna lista: descubre las referencias por regex.
//
// DOS SEVERIDADES, Y POR QUÉ (META-007, 2026-08-03):
//
//   Durante meses este guardrail estuvo en rojo con ~88 rutas rotas, y por eso
//   quedó FUERA del CI —lo dice el propio `ci.yml`: «espera a que su contador
//   llegue a 0»—. El efecto fue el contrario del buscado: con 88 líneas en rojo
//   indistinguibles, nadie leía la salida y todas se volvieron invisibles.
//
//   La prueba está en la tanda del 2026-08-03: cinco prompts exigían leer
//   documentos que no existen (`DATETIME_STANDARD.md`, cuatro `README.md`) y este
//   script YA los marcaba. Hizo falta una auditoría para encontrar algo que el
//   guardrail llevaba tiempo diciendo.
//
//   Por eso ahora distingue:
//
//     🔴 BLOQUEANTE — la ruta rota está dentro de un bloque «Contexto
//        obligatorio» de un prompt. No es un enlace muerto: es una instrucción
//        que el agente no puede cumplir. Falla con exit 1.
//
//     🟡 AVISO — el resto. Se listan agrupadas para poder limpiarlas por lotes,
//        pero no bloquean.
//
//   Con esa distinción el script puede entrar en CI sin esperar a que alguien
//   limpie las 88: vigila desde hoy lo que de verdad rompe a un agente.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { cargar } from "./config.mjs";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const CFG = cargar("refs");
const DOCS_DIRS = CFG.docs;

// Prefijos que son rutas reales del repositorio. Cualquier otra cosa entre
// comillas invertidas (nombres de función, comandos, clases CSS) se ignora.
const ROOTS = CFG.roots;

// Una referencia con marcador de plantilla no es una ruta: es un patrón.
// `docs/audits/YYYY-MM-DD-<slug>.md` no debe existir — describe un nombre futuro.
const ES_PLANTILLA = (p) =>
  /[<>[\]*]|YYYY|MM-DD|\{|\}|\.\.\.|…|\bN\b|\bn{2,}\b|\bN{2,}\b/.test(p) ||
  /\[entity\]|\[module\]|\[Entity\]/.test(p);

// DOCUMENTOS HISTÓRICOS — se excluyen a propósito.
//
// Un CHANGELOG que registra «movido `docs/SECURITY.md` → `docs/architecture/`»
// TIENE que nombrar la ruta vieja: es el registro de que dejó de existir.
// Igual el MIGRATION_LOG, el DONE y los informes de auditoría fechados, que son
// fotos de un momento concreto.
//
// La regla: este guardrail vigila la documentación que un agente SIGUE, no la
// que registra el pasado. Incluir el histórico daba 292 falsos positivos en
// megadatos y 218 en sajama — y un check con ese ruido se ignora entero.
const HISTORICOS = CFG.historical.map((p) => new RegExp(p));
const ES_HISTORICO = (rel) => HISTORICOS.some((r) => r.test(rel));

// OPT-OUT EXPLÍCITO — un documento declara que sus rutas son ilustrativas.
//
// `NEW_MODULE.md` es un tutorial que construye un módulo de Garantías que no
// existe: sus rutas son el ejercicio, no referencias. Igual los prompts que
// escriben `nombre.actions.ts` como marcador de posición.
//
// En vez de mantener una lista dentro del script —lo que este ecosistema
// prohíbe— el propio archivo lo declara en su cabecera:
//
//     <!-- check-refs: ejemplos -->
//
// Es el mismo diseño que `**Tipo**` en los prompts: el archivo declara, el
// script verifica. Añadir el marcador es una decisión trazable en un diff.
// El lookahead excluye `ejemplos-desde` y `ejemplos-hasta`: son el opt-out por
// REGIÓN de más abajo, y sin él este de archivo entero los tragaría —
// desactivando el documento completo justo cuando se pedía acotar un tramo.
const DECLARA_EJEMPLOS = (body) =>
  /<!--\s*check-refs:\s*ejemplos(?!-desde|-hasta)[\s\S]*?-->/.test(body);

// OPT-OUT POR REGIÓN — un TRAMO del documento habla de lo que no existe.
//
// El opt-out de archivo entero no sirve cuando el documento es mayormente real y
// sólo un párrafo es ilustrativo. Pasa en todo documento de arquitectura, que
// necesita nombrar rutas PARA DECIR QUE NO EXISTEN: el anti-ejemplo de YAGNI
// («no crees `src/domain/order.ts` para cuando vendamos»), la nota que registra
// que una carpeta planificada nunca llegó a existir, la plantilla de un ADR.
//
// Sin esto, un proyecto con esa clase de prosa recibe falsos positivos en su
// primera corrida y desactiva el check — que es lo mismo que el bloque de
// DOCUMENTOS HISTÓRICOS existe para evitar, sólo que a otra escala. Medido: los
// 7 hallazgos de la primera corrida sobre un proyecto nuevo eran 7 de éstos.
//
//     <!-- check-refs: ejemplos-desde -->
//     ...prosa que nombra rutas inexistentes a propósito...
//     <!-- check-refs: ejemplos-hasta -->
//
// Una apertura sin cierre llega hasta el final del archivo. Es deliberado: el
// modo de fallo de olvidar el cierre es comprobar de menos, y eso se ve en el
// contador de la salida. Al revés se reportarían rutas ya excusadas.
function regionesEjemplo(body) {
  const rangos = [];
  const marca = /<!--\s*check-refs:\s*ejemplos-(desde|hasta)\s*-->/g;
  let abierto = null;
  for (const m of body.matchAll(marca)) {
    if (m[1] === "desde") {
      if (abierto === null) abierto = m.index;
    } else if (abierto !== null) {
      rangos.push([abierto, m.index + m[0].length]);
      abierto = null;
    }
  }
  if (abierto !== null) rangos.push([abierto, body.length]);
  return rangos;
}

// SECCIONES CRÍTICAS — dónde una ruta rota deja de ser cosmética.
//
// Un prompt que dice «lee primero estos documentos» y nombra uno inexistente no
// tiene un enlace roto: tiene una instrucción imposible. Se detecta por el
// encabezado, no por una lista de archivos — mismo principio que el resto del
// ecosistema: el documento declara, el script verifica.
const ENCABEZADO_CRITICO = /^#{1,6}\s.*(contexto obligatorio|lee primero|contexto requerido)/i;
const ENCABEZADO = /^#{1,6}\s/;

/** Devuelve los rangos [inicio, fin) de línea que pertenecen a una sección crítica. */
function rangosCriticos(body) {
  const lineas = body.split("\n");
  const rangos = [];
  let abierto = null;
  let nivelAbierto = 0;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (!ENCABEZADO.test(l)) continue;
    const nivel = l.match(/^#+/)[0].length;
    if (abierto !== null && nivel <= nivelAbierto) {
      rangos.push([abierto, i]);
      abierto = null;
    }
    if (ENCABEZADO_CRITICO.test(l)) {
      abierto = i;
      nivelAbierto = nivel;
    }
  }
  if (abierto !== null) rangos.push([abierto, lineas.length]);
  return rangos;
}

function walk(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const e of readdirSync(root)) {
    const full = join(root, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (e.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * Ruta relativa al repositorio con separador `/`, siempre.
 *
 * `ES_HISTORICO` y `DECLARA_EJEMPLOS` comparan contra literales `docs/…`. En
 * Windows `relative()` devuelve `docs\CHANGELOG.md` y ninguna de esas reglas
 * casaba: el script omitía 0 históricos en vez de todos, y reportaba como
 * bloqueantes las rutas de `docs/prompts/_archived/`, que están excluidas a
 * propósito por registrar el pasado.
 */
const aRuta = (file) => relative(".", file).split(sep).join("/");

console.log("════════════════════════════════════════════════════════════════");
console.log("  🔗 Check Refs — Rutas citadas en la documentación");
console.log("════════════════════════════════════════════════════════════════\n");

const files = DOCS_DIRS.flatMap((d) => walk(d));
const rotas = [];
let comprobadas = 0;
let plantillas = 0;

let historicos = 0;
let ejemplos = 0;

for (const file of files) {
  const rel = aRuta(file);
  if (ES_HISTORICO(rel)) {
    historicos++;
    continue;
  }
  const body = readFileSync(file, "utf8");
  if (DECLARA_EJEMPLOS(body)) {
    ejemplos++;
    continue;
  }
  const vistas = new Set();
  const ejemploEn = regionesEjemplo(body);
  const criticos = rangosCriticos(body);
  const esCritica = (idx) => {
    const linea = body.slice(0, idx).split("\n").length - 1;
    return criticos.some(([a, b]) => linea >= a && linea < b);
  };

  for (const m of body.matchAll(/`([^`\n]+)`/g)) {
    const raw = m[1].trim();
    if (!ROOTS.some((r) => raw.startsWith(r))) continue;
    if (ejemploEn.some(([a, b]) => m.index >= a && m.index < b)) {
      plantillas++;
      continue;
    }

    // `[`src/providers/node/mod.rs`](https://github.com/…)` es una ruta DENTRO
    // de otro repositorio, enlazada a su GitHub. Empieza como una ruta local y
    // no lo es.
    if (/^\]\(https?:/.test(body.slice(m.index + m[0].length))) continue;

    // Quitar anclas, sufijos de línea (`archivo.ts:42` o `:12,30`) y puntuación.
    const ref = raw
      .split("#")[0]
      .replace(/:\d+(,\d+)*$/, "")
      .replace(/[.,;:]$/, "")
      .trim();
    if (!ref || vistas.has(ref)) continue;
    vistas.add(ref);

    if (ES_PLANTILLA(ref)) {
      plantillas++;
      continue;
    }

    // Una ruta real tiene extensión o termina en `/`. Sin eso es otra cosa que
    // empieza igual: el nombre de una rama git (`docs/add-deployment-guide`),
    // un scope de commit, un módulo. Comprobarlas daría falsos positivos que
    // sólo se arreglan mutilando el texto.
    if (!/\.[a-z0-9]+$/i.test(ref) && !ref.endsWith("/")) {
      plantillas++;
      continue;
    }

    comprobadas++;
    // Un glob (`*.ts`) o un directorio (`docs/adr/`) se validan por su padre.
    const objetivo = ref.includes("*") ? ref.slice(0, ref.lastIndexOf("/")) : ref;
    if (!existsSync(objetivo)) {
      rotas.push({ file: rel, ref, critica: esCritica(m.index) });
    }
  }
}

console.log(`${YELLOW}Referencias en ${DOCS_DIRS.map((d) => `\`${d}/\``).join(", ")}${NC}`);
console.log(`  ${DIM}Comprobadas:${NC} ${comprobadas}`);
console.log(`  ${DIM}Plantillas (con marcador, no se comprueban):${NC} ${plantillas}`);
console.log(`  ${DIM}Archivos analizados:${NC} ${files.length - historicos}`);
console.log(`  ${DIM}Históricos omitidos (registran el pasado):${NC} ${historicos}`);
console.log(`  ${DIM}Con rutas declaradas como ejemplos:${NC} ${ejemplos}\n`);

const bloqueantes = rotas.filter((r) => r.critica);
const avisos = rotas.filter((r) => !r.critica);

const listar = (grupo, color, marca) => {
  const porArchivo = new Map();
  for (const r of grupo) {
    if (!porArchivo.has(r.file)) porArchivo.set(r.file, []);
    porArchivo.get(r.file).push(r.ref);
  }
  for (const [f, refs] of [...porArchivo].sort()) {
    console.log(`  ${f}`);
    refs.forEach((r) => console.log(`     ${color}${marca}${NC} ${r}`));
  }
};

if (bloqueantes.length) {
  console.log(
    `${RED}❌ ${bloqueantes.length} ruta(s) rotas en un bloque de CONTEXTO OBLIGATORIO${NC}`,
  );
  console.log(
    `${DIM}   No son enlaces muertos: son documentos que un prompt manda leer y no existen.${NC}\n`,
  );
  listar(bloqueantes, RED, "✖");
  console.log("");
}

if (avisos.length) {
  console.log(`${YELLOW}⚠️  ${avisos.length} ruta(s) rotas fuera de contextos obligatorios${NC}`);
  console.log(`${DIM}   No bloquean. Conviene limpiarlas por lotes.${NC}\n`);
  listar(avisos, YELLOW, "•");
  console.log("");
}

console.log("════════════════════════════════════════════════════════════════");

if (bloqueantes.length) process.exit(1);

if (!avisos.length) console.log(`${GREEN}✅ Todas las rutas citadas existen${NC}`);
else console.log(`${GREEN}✅ Sin rutas rotas en contextos obligatorios${NC}`);
console.log("════════════════════════════════════════════════════════════════");
