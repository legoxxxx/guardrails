#!/usr/bin/env node
// ─── Check Stack — El stack documentado existe de verdad ─────────────────────
// Ejecutar: npm run lint:stack
//
// QUÉ CUBRE, Y POR QUÉ HACÍA FALTA (ARQ-002, 2026-08-06):
//
//   Cinco guardrails vigilan la documentación: `lint:prompts` el inventario de
//   prompts, `lint:refs` que las rutas citadas existan, `lint:state` las
//   invariantes de los documentos de estado, `lint:sync` la política de
//   sincronía y `lint:worktree` el trabajo en paralelo.
//
//   `ARQ-001` sobrevivió a los cinco. El `README.md` declaró durante meses
//   «State: Zustand + TanStack Query» —dos dependencias que no existen en este
//   repositorio— y ninguno se dio cuenta, porque **ninguno mira `package.json`**.
//   Duele el doble porque el README es lo primero que lee un desarrollador nuevo
//   o un agente de IA, antes que `AGENTS.md`, que es quien tiene la verdad.
//
// LA INVARIANTE INVERSA, QUE ES LA QUE DE VERDAD FALLA:
//
//   `AGENTS.md` menciona Zustand y TanStack Query **a propósito**, para
//   documentar que NO se usan, con su versión de retirada y su porqué. Eso no es
//   el defecto: es la corrección del defecto, y es información valiosa.
//
//   Un script que sólo pregunte «¿está en package.json?» marca las dos cosas
//   igual y se vuelve inservible el primer día — que es exactamente el error que
//   cometió `check-docs-state.mjs` en su primera versión. Por eso aquí la
//   pregunta no es si el paquete existe, sino **cómo se le cita**: un retirado
//   nombrado junto a su marcador de retirada está bien documentado; nombrado
//   como parte del stack vigente, no.
//
// DE DÓNDE SALE EL VOCABULARIO — DESCUBIERTO, NUNCA ESCRITO A MANO:
//
//   Este ecosistema prohíbe las listas dentro de los scripts: `check-prompts.mjs`
//   no contiene ninguna, `check-refs.mjs` tampoco, y el motivo está escrito en
//   los dos —un inventario copiado describe el pasado—. Aquí la tentación era
//   mantener a mano la lista de «paquetes retirados». No hace falta:
//
//     INSTALADOS  →  dependencies + devDependencies de package.json, hoy.
//     HISTÓRICOS  →  cada nombre que apareció en esos dos bloques en CUALQUIER
//                    revisión de package.json. Lo sabe git, no una lista.
//     RETIRADOS   =  HISTÓRICOS \ INSTALADOS
//
//   Los retirados son justo los peligrosos: estuvieron, se documentaron, y la
//   documentación sobrevivió a la desinstalación. Zustand, `@tanstack/react-query`
//   y `xlsx` salen de ahí solos, sin que nadie los escriba.
//
// DOS SEVERIDADES, MISMO CRITERIO QUE `check-refs.mjs`:
//
//     🔴 BLOQUEANTE — un paquete retirado citado SIN marcador de retirada. Es la
//        forma exacta de ARQ-001: documentación que describe un proyecto
//        anterior al código. Falla con exit 1.
//
//     🟡 AVISO — un paquete con scope (`@x/y`) citado que no está instalado ni
//        consta que lo estuviera. Puede ser una errata, un ejemplo o una
//        dependencia transitiva citada de pasada; se lista para revisarlo.
//
//   `ARQ-002` lo pide explícitamente: «la salida útil es la lista, no el exit
//   code». Un guardrail que sale rojo por cosas opinables se deja de leer, y ese
//   fue el destino de `lint:refs` con sus 88 rutas indistinguibles.
//
// ─── SEGUNDA MITAD: LA CONFIGURACIÓN EJECUTABLE (CI-002, 2026-08-10) ─────────
//
//   Todo lo de arriba vigila PROSA. Pero la lección que este proyecto ha
//   aprendido cuatro veces —`CI-001`, `PW-005`, `PW-007` y la campaña del
//   2026-07-24— no es sobre prosa: **corregir el origen no corrige las copias**.
//
//   El 2026-07-24 se corrigió `DEPLOYMENT.md:97` («Seleccionar MariaDB», 🔴) y
//   quedaron vivos los dos únicos sitios donde la afirmación no era prosa sino
//   configuración ejecutable: el workflow y la cabecera de `schema.prisma`. El
//   job `e2e` siguió levantando `mariadb:11` quince días más, ejecutando
//   `prisma migrate deploy` contra un motor que no es el de producción, mientras
//   un comentario afirmaba que sí lo era. Una migración con sintaxis
//   sólo-MariaDB pasaba en verde y luego impedía arrancar el contenedor: error
//   1064, dos veces (CHANGELOG v2.22.1).
//
//   Un documento que miente se lee y se corrige. Una imagen de Docker que miente
//   **da verde**. Por eso estas dos comprobaciones no son del mismo tipo que las
//   de arriba aunque vivan en el mismo script: no preguntan «¿está bien
//   escrito?» sino «¿esta copia sigue igual al original?».
//
//     MOTOR DE LA BD  →  `image:` de los workflows  ↔  `datasource.provider`
//     VERSIÓN DE NODE →  `node-version:` y `.nvmrc` ↔  `engines.node`
//
//   Las dos son comparaciones entre dos archivos legibles por máquina. No se
//   interpreta prosa, no hay heurística y no hay nada opinable: por eso pueden
//   ser 🔴 sin caer en el defecto que ARQ-002 advierte.
//
// ─── LA COPIA QUE NO TIENE ORIGINAL (SESS-004, 2026-08-10) ──────────────────
//
//   Los dos checks de arriba comparan una copia contra su original. El tercero
//   es el caso que faltaba: **dos copias entre sí, sin original ninguno**.
//
//     FILTROS DE RUTA →  `on.push.paths` ↔ `on.pull_request.paths`
//
//   Un workflow que quiere el mismo alcance en las dos puertas tiene que
//   escribir la lista dos veces, porque GitHub no ofrece forma de declararla una
//   sola. `docs.yml` declara once patrones, duplicados. Añadir uno sólo arriba
//   deja los builds de PR sin el guardrail —y el guardrail que se pierde es el
//   que vigila que la imagen de BD no divierja, o sea, CI-002 apagándose solo.
//
//   Lo detectó la primera corrida de `session-audit` con el defecto todavía
//   latente: los once patrones coinciden hoy. Es la única de las cinco
//   comprobaciones de este script que se escribió ANTES de que costara algo.
//
//   Este check necesita navegar `on.push.paths`, no casar una línea suelta, así
//   que abajo hay cuatro funciones que leen el YAML sin dependencias. El porqué
//   de no importar `yaml` está escrito allí, y no es preferencia de estilo.
//
//   ⚠️ LO QUE ESTO **NO** COMPRUEBA, Y NO PUEDE: que `mysql:8.4` case con el
//   8.4.9 de producción. Ese número no vive en el repositorio — se lee en el
//   panel de Dokploy—, así que no hay original contra el que comparar la copia.
//   Inventar una fuente de verdad para él sería crear el problema que este
//   script existe para evitar. Lo que sí se puede exigir es que la etiqueta esté
//   FIJADA: un `:latest` deriva en silencio, y eso sale como 🟡.
//
//   Nota útil: a diferencia del check de paquetes retirados, estas dos NO
//   necesitan historial de git. Siguen valiendo en un clon superficial.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { cargar } from "./config.mjs";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

// Ámbito: lo que ARQ-002 pide vigilar. Son los documentos que describen el
// stack a quien llega nuevo. El CHANGELOG y los informes de auditoría quedan
// fuera a propósito: registran el pasado, y nombrar un paquete retirado es
// justo lo que tienen que hacer (mismo criterio que ES_HISTORICO en check-refs).
const CFG = cargar("stack");
const AMBITO = CFG.ambito;

// Ámbito de la segunda mitad: la configuración ejecutable que copia un dato
// canónico. Se descubre el directorio entero — un workflow nuevo entra solo.
const WORKFLOWS = CFG.workflows;

/**
 * Familia de imagen Docker que corresponde a cada `provider` de Prisma.
 *
 * Este mapa SÍ es una lista escrita a mano, y va contra la regla del ecosistema
 * —`check-prompts.mjs` no contiene ninguna, `check-refs.mjs` tampoco—, así que
 * hace falta el motivo: esas listas están prohibidas porque son **inventarios
 * del proyecto**, y un inventario copiado describe el pasado. Éste no inventaría
 * nada de este repositorio. Es vocabulario de Prisma y de Docker Hub, y no
 * cambia cuando cambia el proyecto: sólo cuando Prisma añade un provider.
 *
 * `mariadb` está en MOTORES pero no es el valor de ningún provider, y ahí está
 * la gracia: es la familia que hay que reconocer para poder rechazarla. Sin
 * ella, `image: mariadb:11` no se distinguiría de `image: redis:7` —una imagen
 * que no es motor de BD y que este check debe ignorar— y `CI-001` volvería a
 * pasar en verde, que es el único fallo que este código existe para impedir.
 */
const MOTOR_DE_PROVIDER = {
  mysql: "mysql",
  postgresql: "postgres",
  mongodb: "mongo",
  sqlserver: "mssql",
  cockroachdb: "cockroachdb",
  sqlite: null, // sin servicio: no hay imagen que comparar
};

const MOTORES = new Set([
  ...Object.values(MOTOR_DE_PROVIDER).filter(Boolean),
  // Confusables: no son destino de ningún provider, pero se levantan por error.
  // `mariadb` es literalmente el defecto de CI-001; el nombre del adaptador
  // (`@prisma/adapter-mariadb`) es lo que invita a la equivocación.
  "mariadb",
  "percona",
  "postgis",
]);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** El `provider` del bloque `datasource`. El bloque no anida llaves. */
function providerDelSchema(ruta = CFG.schema) {
  // `schema: null` es la forma de decir «este proyecto no tiene base de datos».
  // Se distingue de «la ruta no existe» a propósito: lo primero es una decisión
  // declarada y lo segundo puede ser un schema movido de sitio, que sí merece
  // el aviso amarillo.
  if (ruta === null) return "n/a";
  if (!existsSync(ruta)) return null;
  const m = readFileSync(ruta, "utf8").match(
    /datasource\s+\w+\s*\{[^}]*?\bprovider\s*=\s*"([^"]+)"/,
  );
  return m?.[1] ?? null;
}

/** El major de `engines.node` (`"^24"` → `"24"`). Es el dato que se copia. */
function mayorDeEngines(engines) {
  return engines?.node?.match(/(\d+)/)?.[1] ?? null;
}

/**
 * Major de una referencia de versión de Node tal como se escribe en un workflow.
 *
 * Devuelve `null` cuando la referencia NO es una copia del major —`lts/*`,
 * `latest`, `node`—: ahí no hay nada que pueda divergir de `engines.node`, así
 * que callar es correcto y marcarlo sería ruido.
 */
function mayorDeReferenciaNode(valor) {
  return /^v?(\d+)(?:[.x]|$)/.exec(valor)?.[1] ?? null;
}

function ficherosWorkflow() {
  if (!existsSync(WORKFLOWS)) return [];
  return readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/i.test(f))
    .map((f) => join(WORKFLOWS, f))
    .sort();
}

// ─── Lectura de YAML sin dependencias ───────────────────────────────────────
//
// El check 5 necesita navegar `on.push.paths`, y eso ya no se resuelve con una
// regex por línea como los checks 3 y 4: hay que saber DENTRO DE QUÉ está cada
// línea. La tentación es importar `yaml`, y es una trampa doble:
//
//   1. `yaml` no está en `package.json` — ni como dependencia ni como transitiva
//      declarada.
//   2. Aunque se instalara, el job `prompts` de `.github/workflows/docs.yml`
//      **no ejecuta `npm ci`**, a propósito y con el motivo escrito allí. Un
//      `import` de cualquier paquete tumbaría en CI el guardrail entero, no sólo
//      este check.
//
// Así que van estas cuatro funciones. No son un parser de YAML —no manejan
// anclas, ni multilínea, ni tipos— sino lo justo para recorrer el bloque `on:`
// de un workflow, que es una estructura de mapas y secuencias sin nada de eso.

/**
 * Las líneas significativas de un YAML, con su sangría.
 *
 * Fuera las vacías y los comentarios de línea entera. Ese filtro no es cosmético:
 * `docs.yml` tiene **trece líneas de comentario en medio** de la secuencia de
 * `on.push.paths`. Tratarlas como fin de bloque partiría la lista en dos y el
 * check compararía media lista contra otra entera — un falso positivo que además
 * apunta al sitio equivocado.
 */
function lineasYaml(texto) {
  return texto
    .split("\n")
    .map((raw, i) => ({ n: i + 1, raw }))
    .filter(({ raw }) => raw.trim() !== "" && !/^\s*#/.test(raw))
    .map((o) => ({ ...o, sangria: /^ */.exec(o.raw)[0].length, cuerpo: o.raw.trim() }));
}

/**
 * El hijo directo `clave` de un bloque ya acotado, o `null`.
 *
 * «Hijo directo» = el que está a la sangría MÍNIMA del bloque; su cuerpo es todo
 * lo que le sigue con más sangría, hasta el siguiente hermano. La profundidad no
 * se escribe en ningún sitio: se deduce del bloque que se recibe. Así el check
 * sigue valiendo si alguien reindenta el workflow, que es reformateo legítimo y
 * no debería teñir de rojo un guardrail.
 */
function hijoYaml(bloque, clave) {
  if (!bloque.length) return null;
  const nivel = Math.min(...bloque.map((l) => l.sangria));
  const re = new RegExp(`^["']?${esc(clave)}["']?\\s*:(.*)$`);
  const i = bloque.findIndex((l) => l.sangria === nivel && re.test(l.cuerpo));
  if (i === -1) return null;
  const resto = bloque.slice(i + 1);
  const corte = resto.findIndex((l) => l.sangria <= nivel);
  return {
    cabecera: bloque[i],
    enLinea: re.exec(bloque[i].cuerpo)[1].trim(),
    cuerpo: corte === -1 ? resto : resto.slice(0, corte),
  };
}

/** Un escalar sin comillas ni comentario de cola. El `#` dentro de comillas no lo es. */
function escalarYaml(v) {
  const s = v.trim();
  const comilla = s[0];
  if (comilla === '"' || comilla === "'") {
    const fin = s.indexOf(comilla, 1);
    if (fin > 0) return s.slice(1, fin);
  }
  return s.split(" #")[0].trim();
}

/** Los elementos de una secuencia, en bloque (`- x`) o en línea (`[x, y]`). `null` si no hay. */
function listaYaml(nodo) {
  if (!nodo) return null;
  if (nodo.enLinea.startsWith("[")) {
    const dentro = nodo.enLinea.slice(1, nodo.enLinea.lastIndexOf("]"));
    return dentro.trim() ? dentro.split(",").map(escalarYaml) : [];
  }
  if (!nodo.cuerpo.length) return null;
  const nivel = Math.min(...nodo.cuerpo.map((l) => l.sangria));
  return nodo.cuerpo
    .filter((l) => l.sangria === nivel && l.cuerpo.startsWith("-"))
    .map((l) => escalarYaml(l.cuerpo.replace(/^-\s*/, "")));
}

/** Espaciado a un solo espacio, y fuera los `>` de blockquote que parten las frases. */
const aplanar = (s) => s.replace(/\n\s*>?\s*/g, " ").replace(/\s+/g, " ");

/**
 * Formas en las que un paquete puede aparecer escrito en prosa.
 *
 * Un documento no escribe `@tanstack/react-query`: escribe «TanStack Query».
 * Buscar sólo el nombre npm exacto habría dejado pasar ARQ-001 entero, que es
 * el caso que este guardrail existe para cazar.
 *
 * La regla: el primer y el último token son obligatorios, los de en medio
 * opcionales, y entre ellos vale espacio, guion o barra. Así
 * `@tanstack/react-query` casa con «TanStack Query», «TanStack React Query» y
 * con el propio nombre npm, sin casar con «TanStack Table», que es otro paquete
 * y sí está instalado.
 */
function formaDe(nombre) {
  const tokens = nombre.replace(/^@/, "").split(/[/-]/).filter(Boolean);
  if (tokens.length === 1) return new RegExp(`\\b${esc(tokens[0])}\\b`, "gi");
  const primero = tokens[0];
  const ultimo = tokens[tokens.length - 1];
  const medio = tokens
    .slice(1, -1)
    .map((t) => `(?:${esc(t)}[\\s/-]*)?`)
    .join("");
  return new RegExp(`\\b${esc(primero)}[\\s/-]*${medio}${esc(ultimo)}\\b`, "gi");
}

/**
 * ¿La cita reconoce que el paquete ya no está?
 *
 * No basta con que la palabra aparezca: hay que mirar cómo se la nombra. Estos
 * son los verbos y giros con los que este repositorio documenta una retirada —
 * salen de `AGENTS.md` y de `system-header.md`, que ya lo hacen bien.
 *
 * `❌` entra en la lista porque en este repositorio es un marcador con
 * significado propio: encabeza las prohibiciones de `AGENTS.md` y las columnas
 * de antipatrones. Una fila «❌ Zustand/Redux para CRUD» está documentando
 * exactamente lo contrario de un stack vigente.
 */
const MARCADOR_RETIRADA =
  /(elimin|retir|desinstal|reinstal|prohib|nunca|jam[áa]s|ya no|no se us|no usa|no existe|no está instalad|no lo usa|no forma parte|no aparece|reemplaz|sustitu|deprecad|obsolet|se fue|cero|~~|❌)/i;

/**
 * Negación pegada a la mención: «Sin TanStack Query», «ni Zustand».
 *
 * Va aparte de la lista de arriba y mira sólo los caracteres inmediatamente
 * anteriores, porque la alternativa —meter `sin` en el regex de párrafo— casa
 * con «sin embargo» y con cualquier otra frase del bloque. Eso no sería un
 * falso positivo de más: sería un falso NEGATIVO, y un guardrail que calla
 * cuando debería hablar es peor que no tenerlo.
 */
const NEGADO_ANTES = /\b(sin|ni|no)\s+[*_`«"“]*$/i;

/** Bloques separados por línea en blanco: el párrafo, la fila de tabla, el ítem de lista. */
function bloques(body) {
  const lineas = body.split("\n");
  const out = [];
  let inicio = 0;
  for (let i = 0; i <= lineas.length; i++) {
    if (i === lineas.length || lineas[i].trim() === "") {
      if (i > inicio) out.push({ desde: inicio, hasta: i, texto: lineas.slice(inicio, i).join("\n") });
      inicio = i + 1;
    }
  }
  return out;
}

function walk(root) {
  const out = [];
  if (!existsSync(root)) return out;
  if (statSync(root).isFile()) return root.endsWith(".md") ? [root] : [];
  for (const e of readdirSync(root)) {
    const full = join(root, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (e.endsWith(".md")) out.push(full);
  }
  return out;
}

const aRuta = (f) => relative(".", f).split(sep).join("/");

// ─── Vocabulario ────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const INSTALADOS = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/**
 * Cada nombre que estuvo alguna vez en dependencies/devDependencies.
 *
 * Se parsea cada revisión como JSON en vez de leer el diff con una regex: un
 * `git log -p` deja pasar `"version"` y `"node"` —de `engines`— como si fueran
 * paquetes, porque tienen la misma forma `"clave": "^n"`. Costó dos falsos
 * positivos descubrirlo mientras se escribía este script.
 */
function historicos() {
  let shas;
  try {
    // Un clon superficial es el peor escenario posible para este script, y el
    // más fácil de encontrarse: `actions/checkout` trae `fetch-depth: 1` por
    // defecto. Git responde, `git log` devuelve UN commit, y RETIRADOS sale
    // casi vacío — con lo que el guardrail informa verde sin haber comprobado
    // nada. Es justo el «check verde que no comprueba nada» contra el que avisa
    // la cabecera de `.github/workflows/docs.yml`. Mejor decirlo que fingir.
    const superficial = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (superficial === "true") return "superficial";

    shas = execFileSync("git", ["log", "--format=%H", "--", "package.json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return null; // sin git (tarball): el check 🔴 se degrada, no revienta
  }
  const nombres = new Set();
  for (const sha of shas) {
    try {
      const raw = execFileSync("git", ["show", `${sha}:package.json`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 8 * 1024 * 1024,
      });
      const j = JSON.parse(raw);
      for (const n of Object.keys(j.dependencies ?? {})) nombres.add(n);
      for (const n of Object.keys(j.devDependencies ?? {})) nombres.add(n);
    } catch {
      // revisión ilegible o JSON roto en su momento: se ignora esa foto
    }
  }
  return nombres;
}

console.log("════════════════════════════════════════════════════════════════");
console.log("  📦 Check Stack — El stack documentado existe");
console.log("════════════════════════════════════════════════════════════════\n");

const historial = historicos();
const superficial = historial === "superficial";
const sinGit = historial === null || superficial;
const HISTORICOS = sinGit ? new Set() : historial;
const RETIRADOS = sinGit ? [] : [...HISTORICOS].filter((n) => !INSTALADOS.has(n)).sort();

const formas = new Map(RETIRADOS.map((n) => [n, formaDe(n)]));

// ─── Recorrido ──────────────────────────────────────────────────────────────

const archivos = AMBITO.flatMap(walk);
const bloqueantes = [];
const avisos = [];
let citasOk = 0;

for (const file of archivos) {
  const rel = aRuta(file);
  const body = readFileSync(file, "utf8");
  const bls = bloques(body);
  const lineas = body.split("\n");

  // Check 1 — retirados citados como vigentes
  for (const [nombre, re] of formas) {
    re.lastIndex = 0;
    for (const m of body.matchAll(re)) {
      const nLinea = body.slice(0, m.index).split("\n").length - 1;
      const linea = lineas[nLinea] ?? "";
      const bloque = bls.find((b) => nLinea >= b.desde && nLinea < b.hasta);
      const prefijo = body.slice(Math.max(0, m.index - 30), m.index);
      // Aplanar el espaciado antes de buscar marcadores: el markdown ajusta la
      // prosa a ~100 columnas y parte «dos dependencias que no / existen» en dos
      // líneas. Comprobar contra el texto crudo hace que cualquier marcador de
      // más de una palabra falle según dónde caiga el salto — que es azar puro.
      const reconocido =
        NEGADO_ANTES.test(prefijo) ||
        MARCADOR_RETIRADA.test(aplanar(linea)) ||
        (bloque && MARCADOR_RETIRADA.test(aplanar(bloque.texto)));
      if (reconocido) {
        citasOk++;
        continue;
      }
      bloqueantes.push({ file: rel, nombre, linea: nLinea + 1, texto: linea.trim().slice(0, 110) });
    }
  }

  // Check 2 — paquetes con scope citados que no constan en ninguna revisión
  for (const m of body.matchAll(/`(@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)`/gi)) {
    const nombre = m[1];
    if (INSTALADOS.has(nombre)) {
      citasOk++;
      continue;
    }
    if (!sinGit && HISTORICOS.has(nombre)) continue; // lo cubre el check 1
    const nLinea = body.slice(0, m.index).split("\n").length - 1;
    avisos.push({ file: rel, nombre, linea: nLinea + 1, texto: (lineas[nLinea] ?? "").trim().slice(0, 110) });
  }
}

// ─── Checks 3 y 4 — la configuración ejecutable contra el dato canónico ─────

const PROVIDER = providerDelSchema();
const MOTOR_ESPERADO = PROVIDER && PROVIDER !== "n/a" ? MOTOR_DE_PROVIDER[PROVIDER] : undefined;
const NODE_ESPERADO = mayorDeEngines(pkg.engines);

const desajustes = [];
// Aparte de `avisos`, que rotula «paquetes con scope»: mezclarlos daría un
// encabezado que miente sobre la mitad de su propia lista.
const avisosConfig = [];
const workflows = ficherosWorkflow();
let copiasOk = 0;

// Los dos filtros de ruta que GitHub admite en un disparador. Son excluyentes
// entre sí dentro del mismo disparador, pero cada uno puede estar duplicado
// entre `push` y `pull_request`, que es lo que este check vigila.
const FILTROS_DE_RUTA = ["paths", "paths-ignore"];

for (const file of workflows) {
  const rel = aRuta(file);
  const fuente = readFileSync(file, "utf8");
  const lineas = fuente.split("\n");

  lineas.forEach((linea, i) => {
    const nLinea = i + 1;
    const texto = linea.trim().slice(0, 110);

    // Check 3 — el motor de la BD que se levanta es el del schema
    const img = /^\s*image:\s*["']?([^"'\s#]+)/.exec(linea);
    if (img) {
      const ref = img[1];
      // El DIGEST se separa primero, y ese orden no es un detalle: `mysql@sha256:a1`
      // lleva un `:` DENTRO del digest, así que buscar la etiqueta antes de
      // quitarlo da la familia `mysql@sha256` — que no está en MOTORES y por
      // tanto se ignora en SILENCIO. Un `mariadb@sha256:…` se colaba entero: el
      // falso negativo exacto que este check existe para no tener.
      const [sinDigest, digest] = ref.split("@");
      const corte = sinDigest.lastIndexOf(":");
      // Sin `:` no hay etiqueta; el `/` descarta un `:` de puerto en el registro
      const conEtiqueta = corte > sinDigest.lastIndexOf("/");
      const base = conEtiqueta ? sinDigest.slice(0, corte) : sinDigest;
      const familia = base.split("/").pop().toLowerCase();
      const etiqueta = conEtiqueta ? sinDigest.slice(corte + 1) : null;
      // Un digest es el anclaje MÁS fuerte que existe: fija el byte exacto, no
      // una etiqueta móvil. `mysql@sha256:…` sin etiqueta está mejor fijado que
      // `mysql:8.4`, así que reclamarle una etiqueta sería exigir lo contrario.
      const fijada = Boolean(digest) || Boolean(etiqueta && etiqueta !== "latest");

      // Una imagen que no es motor de BD no es asunto de este check: `redis`,
      // `node` o un contenedor de herramientas pasan sin mirarse.
      //
      // ⚠️ Punto ciego declarado: una imagen interpolada —`image: ${{ matrix.db }}`—
      // no se puede resolver leyendo el YAML, así que cae aquí y se ignora. Es
      // un límite real, no un descuido: resolver expresiones de Actions sería
      // reimplementar su motor. Si algún día se usa una matriz de motores, este
      // check deja de cubrir ese job y hay que decirlo en el propio workflow.
      if (MOTORES.has(familia)) {
        if (MOTOR_ESPERADO && familia !== MOTOR_ESPERADO) {
          desajustes.push({
            file: rel,
            linea: nLinea,
            texto,
            nombre: `motor \`${familia}\` donde el schema declara \`${PROVIDER}\``,
            detalle:
              `\`prisma/schema.prisma\` declara \`provider = "${PROVIDER}"\`, así que la imagen ` +
              `debe ser de la familia \`${MOTOR_ESPERADO}\`. Este job ejecuta migraciones: ` +
              `validarlas contra otro motor es lo que bloqueó producción dos veces (CI-001).`,
          });
        } else if (!fijada) {
          avisosConfig.push({
            file: rel,
            linea: nLinea,
            texto,
            nombre: `${familia} sin versión fijada`,
            detalle:
              "Producción corre una versión concreta; `latest` deriva en silencio y el día " +
              "que cambie el major nadie lo habrá decidido.",
          });
        } else copiasOk++;
      }
    }

    // Check 4 — la versión de Node del runner es la que exige package.json
    const nv = /^\s*node-version:\s*["']?([^"'\s#]+)/.exec(linea);
    if (nv && NODE_ESPERADO) {
      const mayor = mayorDeReferenciaNode(nv[1]);
      if (mayor === null) {
        // `lts/*`, `latest`, `node`: no copian el major, no pueden divergir de él
      } else if (mayor !== NODE_ESPERADO) {
        desajustes.push({
          file: rel,
          linea: nLinea,
          texto,
          nombre: `Node ${mayor} donde \`engines.node\` exige ${NODE_ESPERADO}`,
          detalle:
            `\`package.json\` declara \`engines.node: "${pkg.engines.node}"\`, que es lo que ` +
            "consulta Nixpacks para construir la imagen de producción. Un runner con otro " +
            "major prueba un runtime que nadie va a desplegar.",
        });
      } else copiasOk++;
    }
  });

  // Check 5 — los filtros de ruta de `push` y `pull_request` son la misma lista
  //
  // Un workflow que quiere el mismo alcance en las dos puertas escribe la lista
  // DOS VECES: GitHub no ofrece forma de declararla una sola. Es exactamente la
  // clase de defecto que cerró CI-002 —una copia de un dato canónico sin nadie
  // que la vigile— sólo que aquí no hay original: son dos copias entre sí.
  //
  // POR QUÉ SÓLO SE COMPARA CUANDO LAS DOS EXISTEN:
  //
  //   Si `push` declara un filtro y `pull_request` no declara ninguno, no hay
  //   copia — hay una sola declaración, y nada de lo que divergir. Además la
  //   asimetría siempre cae del lado seguro: el disparador sin filtro se ejecuta
  //   SIEMPRE, es decir, cubre de más, nunca de menos. Marcarlo dejaría este
  //   check permanentemente amarillo por `ci.yml`, que hace justo eso a
  //   propósito. Un guardrail que siempre avisa se deja de leer — es la lección
  //   de ARQ-002 y de las 88 rutas de `lint:refs`.
  //
  // Se comparan como CONJUNTOS: reordenar la lista no cambia en nada cómo se
  // comporta GitHub, así que teñir de rojo un reordenado sería ruido puro.
  const on = hijoYaml(lineasYaml(fuente), "on");
  const push = on && hijoYaml(on.cuerpo, "push");
  const pr = on && hijoYaml(on.cuerpo, "pull_request");

  if (push && pr) {
    for (const clave of FILTROS_DE_RUTA) {
      const nodoPush = hijoYaml(push.cuerpo, clave);
      const enPush = listaYaml(nodoPush);
      const enPr = listaYaml(hijoYaml(pr.cuerpo, clave));
      if (!enPush || !enPr) continue; // una sola declaración: no hay copia

      const setPush = new Set(enPush);
      const setPr = new Set(enPr);
      const soloPush = enPush.filter((p) => !setPr.has(p));
      const soloPr = enPr.filter((p) => !setPush.has(p));

      if (!soloPush.length && !soloPr.length) {
        copiasOk++;
        continue;
      }

      // La consecuencia es OPUESTA según el filtro, y decirla al revés mandaría
      // a quien lo lea a buscar el problema donde no está.
      const consecuencia =
        clave === "paths"
          ? "El disparador al que le falta un patrón NO ejecuta el workflow para esos " +
            "cambios: el guardrail desaparece de ese lado, en silencio y en verde."
          : "El disparador al que le falta un patrón SÍ ejecuta el workflow para esos " +
            "cambios, así que las dos puertas dejan de probar lo mismo.";

      desajustes.push({
        file: rel,
        linea: nodoPush.cabecera.n,
        texto: nodoPush.cabecera.cuerpo.slice(0, 110),
        nombre:
          `\`${clave}\` difiere entre \`push\` y \`pull_request\` ` +
          `(${soloPush.length + soloPr.length} patrón(es))`,
        detalle:
          (soloPush.length ? `Sólo en \`push\`: ${soloPush.join(", ")}. ` : "") +
          (soloPr.length ? `Sólo en \`pull_request\`: ${soloPr.join(", ")}. ` : "") +
          consecuencia,
      });
    }
  }
}

// `.nvmrc` es la tercera copia del mismo dato, y la que nadie mira: no la lee
// Nixpacks —`engines.node` tiene precedencia— pero sí `nvm use` en local, así
// que divergir manda al desarrollador a un runtime distinto del de producción.
if (existsSync(".nvmrc") && NODE_ESPERADO) {
  const mayor = mayorDeReferenciaNode(readFileSync(".nvmrc", "utf8").trim());
  if (mayor !== null && mayor !== NODE_ESPERADO) {
    desajustes.push({
      file: ".nvmrc",
      linea: 1,
      texto: readFileSync(".nvmrc", "utf8").trim(),
      nombre: `Node ${mayor} donde \`engines.node\` exige ${NODE_ESPERADO}`,
      detalle:
        "`engines.node` tiene precedencia para Nixpacks, así que producción no se rompe; " +
        "quien se lleva el runtime equivocado es el desarrollador con `nvm use`.",
    });
  } else if (mayor !== null) copiasOk++;
}

// ─── Informe ────────────────────────────────────────────────────────────────

console.log(`${YELLOW}Vocabulario${NC}`);
console.log(`  ${DIM}Instalados hoy:${NC} ${INSTALADOS.size}`);
if (superficial) {
  console.log(`  ${RED}⚠️  Clon SUPERFICIAL: el historial de package.json no está disponible${NC}`);
  console.log(`  ${DIM}El check de paquetes retirados queda DESACTIVADO — este verde no vale.${NC}`);
  console.log(`  ${DIM}En CI: actions/checkout con \`fetch-depth: 0\`.${NC}`);
} else if (sinGit) {
  console.log(`  ${YELLOW}⚠️  Sin historial de git: no se puede calcular qué se retiró${NC}`);
  console.log(`  ${DIM}El check de paquetes retirados queda desactivado en esta corrida.${NC}`);
} else {
  console.log(`  ${DIM}Vistos alguna vez en package.json:${NC} ${HISTORICOS.size}`);
  console.log(
    `  ${DIM}Retirados (se vigila cómo se les cita):${NC} ${RETIRADOS.length}` +
      (RETIRADOS.length ? ` ${DIM}— ${RETIRADOS.join(", ")}${NC}` : ""),
  );
}
console.log(`  ${DIM}Documentos analizados:${NC} ${archivos.length}`);
console.log(`  ${DIM}Citas correctas:${NC} ${citasOk}\n`);

console.log(`${YELLOW}Configuración ejecutable${NC}`);
console.log(
  `  ${DIM}Motor canónico (${"schema.prisma"}):${NC} ` +
    (PROVIDER
      ? `${PROVIDER}${MOTOR_ESPERADO ? ` ${DIM}→ imagen \`${MOTOR_ESPERADO}\`${NC}` : ` ${DIM}(sin servicio que comparar)${NC}`}`
      : PROVIDER === "n/a"
        ? `${DIM}no aplica — sin base de datos${NC}`
        : `${YELLOW}no se pudo leer${NC}`),
);
console.log(
  `  ${DIM}Node canónico (engines.node):${NC} ` +
    (NODE_ESPERADO ? `${NODE_ESPERADO}` : `${YELLOW}no declarado${NC}`),
);
console.log(`  ${DIM}Workflows analizados:${NC} ${workflows.length}`);
console.log(`  ${DIM}Copias que cuadran:${NC} ${copiasOk}\n`);

/** Corta un párrafo a ~86 columnas sin partir palabras. */
const envolver = (s, ancho = 86) =>
  s.split(" ").reduce((ls, w) => {
    const i = ls.length - 1;
    if (ls[i] && `${ls[i]} ${w}`.length <= ancho) ls[i] += ` ${w}`;
    else ls.push(w);
    return ls;
  }, []);

const listar = (grupo, color, marca) => {
  const porArchivo = new Map();
  for (const r of grupo) {
    if (!porArchivo.has(r.file)) porArchivo.set(r.file, []);
    porArchivo.get(r.file).push(r);
  }
  for (const [f, rs] of [...porArchivo].sort()) {
    console.log(`  ${f}`);
    for (const r of rs) {
      console.log(`     ${color}${marca}${NC} ${r.nombre} ${DIM}(línea ${r.linea})${NC}`);
      console.log(`       ${DIM}${r.texto}${NC}`);
      // El detalle sólo lo llevan los checks 3 y 4: ahí el hallazgo no se explica
      // solo. En los checks 1 y 2 la línea citada ya es el argumento entero.
      if (r.detalle) for (const l of envolver(r.detalle)) console.log(`       ${DIM}↳ ${l}${NC}`);
    }
  }
};

if (bloqueantes.length) {
  console.log(`${RED}❌ ${bloqueantes.length} cita(s) a paquetes que ya no están instalados${NC}`);
  console.log(
    `${DIM}   No es una errata: es documentación que describe un proyecto anterior al código.${NC}`,
  );
  console.log(
    `${DIM}   Si la mención es deliberada —documentar que NO se usa— basta con decirlo${NC}`,
  );
  console.log(`${DIM}   en la misma línea o su párrafo: «eliminado», «nunca se usó», «retirado».${NC}\n`);
  listar(bloqueantes, RED, "✖");
  console.log("");
}

if (desajustes.length) {
  console.log(`${RED}❌ ${desajustes.length} copia(s) de un dato canónico que ya no cuadran${NC}`);
  console.log(`${DIM}   No es prosa desactualizada: es configuración que se EJECUTA, y que da${NC}`);
  console.log(`${DIM}   verde mientras prueba algo distinto de lo que se despliega.${NC}`);
  console.log(`${DIM}   Si hay original —schema, package.json— se corrige la copia y nunca él;${NC}`);
  console.log(`${DIM}   si son dos copias gemelas —los \`paths\` de push y pull_request— se igualan.${NC}\n`);
  listar(desajustes, RED, "✖");
  console.log("");
}

if (avisos.length) {
  console.log(`${YELLOW}⚠️  ${avisos.length} paquete(s) con scope citados y no instalados${NC}`);
  console.log(`${DIM}   No bloquean: pueden ser ejemplos, erratas o dependencias transitivas.${NC}\n`);
  listar(avisos, YELLOW, "•");
  console.log("");
}

if (avisosConfig.length) {
  console.log(`${YELLOW}⚠️  ${avisosConfig.length} imagen(es) de servicio sin versión fijada${NC}`);
  console.log(`${DIM}   No bloquean: no hay en el repositorio un original contra el que${NC}`);
  console.log(`${DIM}   comparar el número exacto de producción. Sí conviene decidirlo.${NC}\n`);
  listar(avisosConfig, YELLOW, "•");
  console.log("");
}

console.log("════════════════════════════════════════════════════════════════");

if (bloqueantes.length || desajustes.length) process.exit(1);

if (!avisos.length && !avisosConfig.length)
  console.log(`${GREEN}✅ Todo paquete citado existe, y la configuración copia bien el original${NC}`);
else console.log(`${GREEN}✅ Ningún paquete retirado se cita como vigente, ni hay copias divergentes${NC}`);
console.log("════════════════════════════════════════════════════════════════");
