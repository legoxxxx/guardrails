// ─── Wiring — ningún guardrail está desconectado ─────────────────────────────
//
// POR QUÉ EXISTE:
//
//   Un guardrail que no ejecuta nadie es indistinguible de uno que pasa. No
//   avisa, no falla, no aparece en ningún log — simplemente no está. Y ha pasado
//   dos veces en el mismo repositorio, las dos con coste:
//
//     · Un guardrail de clases de color existía con su script npm y durante
//       semanas **no lo ejecutaba nada**: ni un hook ni un workflow. Su modo de
//       fallo es silencioso por construcción, así que el defecto llegaba a
//       producción con todas las herramientas en verde.
//
//     · Un guardrail de documentos de estado era el ÚNICO de cinco que no corría
//       en su workflow. Entró seis meses tarde, y en ese hueco el documento que
//       vigilaba se pudo borrar DOS veces sin que nada lo parase.
//
//   Los guardrails vigilan el código y la documentación. Nadie los vigilaba a
//   ellos.
//
// QUÉ COMPRUEBA, Y EN LOS DOS SENTIDOS:
//
//   1. Todo guardrail se invoca desde algún sitio real.
//   2. Todo comando citado en un hook o un workflow existe de verdad.
//
//   El segundo no es simetría estética: un workflow que invoca un script
//   renombrado falla en rojo, sí, pero sólo cuando alguien empuja algo que
//   dispare ese workflow. Puede tardar semanas.
//
// POR QUÉ BUSCA POR RUTA **Y** POR SCRIPT npm:
//
//   Porque las dos formas conviven. Un hook puede invocar
//   `node scripts/check-commit-msg.mjs "$1"` por ruta directa mientras un
//   workflow usa `npm run lint:refs`. Al construir esto, un inventario que sólo
//   buscaba el script npm dio un guardrail por DESCONECTADO cuando llevaba meses
//   corriendo en cada commit.
//
//   Un inventario que conoce una sola forma de invocación miente en la dirección
//   peligrosa: declara muerto lo que está vivo, y quien lo lea borrará algo que
//   hacía falta.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./config.mjs";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const CFG = cargar("wiring");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = pkg.scripts ?? {};

/**
 * Los guardrails se DESCUBREN, no se listan.
 *
 * Dos clases, porque las dos existen: archivos propios del proyecto y comandos
 * de este paquete cableados en `package.json`. Un proyecto puede tener sólo una
 * de las dos —o ninguna, y entonces no hay nada que vigilar y se dice.
 */
function descubrir() {
  const hallados = [];

  for (const dir of CFG.dirs) {
    if (!existsSync(dir)) continue;
    for (const entrada of readdirSync(dir)) {
      if (!new RegExp(CFG.pattern).test(entrada)) continue;
      const ruta = `${dir}/${entrada}`;
      hallados.push({
        que: ruta,
        clase: "archivo",
        script: Object.keys(scripts).find((k) => scripts[k].includes(entrada)),
      });
    }
  }

  // Comandos del propio paquete: `"lint:nul": "guardrails nul"`.
  for (const [nombre, cmd] of Object.entries(scripts)) {
    const m = /(?:^|\s|\/)guardrails(?:\.mjs)?\s+([a-z-]+)/.exec(cmd);
    if (m && m[1] !== "wiring") {
      hallados.push({ que: `guardrails ${m[1]}`, clase: "paquete", script: nombre });
    }
  }
  return hallados;
}

/** Todo texto donde un guardrail puede estar invocado. */
function superficies() {
  const fuentes = [];
  for (const ruta of CFG.surfaces) {
    if (!existsSync(ruta)) continue;
    const st = statSync(ruta);
    if (st.isDirectory()) {
      for (const e of readdirSync(ruta)) {
        const f = join(ruta, e);
        try {
          if (statSync(f).isFile()) fuentes.push({ fuente: f, texto: readFileSync(f, "utf8") });
        } catch {
          /* enlace roto o permiso: no es una superficie */
        }
      }
    } else {
      fuentes.push({ fuente: ruta, texto: readFileSync(ruta, "utf8") });
    }
  }
  // Los agregados cuentan: son la puerta que corre una persona antes de cerrar.
  for (const agg of CFG.aggregates) {
    if (scripts[agg]) fuentes.push({ fuente: `package.json → ${agg}`, texto: scripts[agg] });
  }
  return fuentes;
}

const GUARDRAILS = descubrir();
const SUPERFICIE = superficies();

console.log("════════════════════════════════════════════════════════════════");
console.log("  🔌 Wiring — ningún guardrail está desconectado");
console.log("════════════════════════════════════════════════════════════════\n");

if (GUARDRAILS.length === 0) {
  console.log(`  ${DIM}Este proyecto no declara ningún guardrail. Nada que vigilar.${NC}`);
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(0);
}

const errores = [];
let ok = 0;

console.log(`${YELLOW}Cada guardrail y dónde se ejecuta${NC}\n`);
for (const g of GUARDRAILS) {
  const sitios = SUPERFICIE.filter(({ texto }) => {
    const porRuta = g.clase === "archivo" && texto.includes(g.que);
    // TERCERA forma de invocación: el binario directo. Un hook no puede usar
    // `npm run` sin pagar el arranque de npm, así que llama a
    // `./node_modules/.bin/guardrails <cmd>`; y un job de CI sin `npm ci` usa
    // `npx …#tag <cmd>`. Sin esto, un guardrail cableado en un hook salía como
    // DESCONECTADO — el mismo error que este comando existe para no cometer, y
    // que se cometió aquí al generalizarlo.
    const porBinario = g.clase === "paquete" && new RegExp(`guardrails\\S*\\s+${g.que.split(" ")[1]}\\b`).test(texto);
    const porScript =
      g.script !== undefined &&
      new RegExp(`(^|\\s|["'])${g.script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|["']|$)`).test(
        texto,
      );
    return porRuta || porBinario || porScript;
  }).map(({ fuente }) => fuente);

  const razonManual = CFG.manual?.[g.que.replace(/^guardrails /, "")];
  if (sitios.length === 0 && razonManual !== undefined) {
    ok++;
    console.log(`  ${DIM}○${NC} ${g.que.padEnd(38)} ${DIM}manual — ${razonManual}${NC}`);
  } else if (sitios.length === 0) {
    errores.push(
      `${g.que} no lo ejecuta nada` +
        (g.script === undefined
          ? " — y no tiene script en package.json"
          : ` — su script es \`${g.script}\``),
    );
    console.log(`  ${RED}✖${NC} ${g.que.padEnd(38)} ${DIM}desconectado${NC}`);
  } else {
    ok++;
    console.log(`  ${GREEN}✔${NC} ${g.que.padEnd(38)} ${DIM}${sitios.join(" · ")}${NC}`);
  }
}

// ─── Las versiones fijadas no divergen entre sí ─────────────────────────────
//
// Cada `npx …guardrails#vX` de un workflow es una COPIA de la versión que
// `package.json` declara. Copias sin original divergen sin que nadie decida: al
// escribir esta comprobación, un workflow llevaba meses fijado en la primera
// versión publicada mientras el resto del repositorio iba cuatro por delante.
// Nadie lo notó porque el comando que invocaba no había cambiado — o sea, se
// enteraría el día en que sí importara.
//
// Es la misma forma que `stack` aplica al motor de base de datos y a la versión
// de Node: hay un dato canónico y hay copias, y las copias se comprueban.
const declarada = /guardrails#(v[\d.]+)/.exec(pkg.devDependencies?.guardrails ?? "")?.[1];
const pines = new Map();
for (const { fuente, texto } of SUPERFICIE) {
  for (const m of texto.matchAll(/guardrails#(v[\d.]+)/g)) {
    if (!pines.has(m[1])) pines.set(m[1], []);
    pines.get(m[1]).push(fuente);
  }
}
const desfasadas = [...pines].filter(([v]) => declarada !== undefined && v !== declarada);
if (desfasadas.length) {
  console.log(`\n${YELLOW}Versiones fijadas que no cuadran con package.json${NC}\n`);
  for (const [v, fuentes] of desfasadas) {
    console.log(`  ${RED}✖${NC} ${v} en ${[...new Set(fuentes)].join(", ")}`);
    errores.push(
      `${[...new Set(fuentes)].join(", ")} fija ${v} y \`package.json\` declara ${declarada}`,
    );
  }
}

// ─── Sentido inverso: lo que se invoca existe ────────────────────────────────
// Los dígitos cuentan: sin ellos `test:e2e` se parte en `test:e` y se reporta
// como inexistente. Un guardrail que inventa hallazgos se desactiva igual de
// rápido que uno que no encuentra ninguno.
const CITAS = /npm run ([a-z0-9]+:[a-z0-9:-]+)|(scripts\/[a-z0-9-]+\.mjs)/g;
const rotas = [];
for (const { fuente, texto } of SUPERFICIE) {
  if (fuente.startsWith("package.json")) continue;
  for (const m of texto.matchAll(CITAS)) {
    const [, script, ruta] = m;
    if (script !== undefined && scripts[script] === undefined) {
      rotas.push(`${fuente} invoca \`npm run ${script}\`, que no está en package.json`);
    }
    if (ruta !== undefined && !existsSync(ruta)) {
      rotas.push(`${fuente} invoca \`${ruta}\`, que no existe`);
    }
  }
}
if (rotas.length) {
  console.log(`\n${YELLOW}Invocaciones a algo que no existe${NC}\n`);
  for (const r of [...new Set(rotas)]) console.log(`  ${RED}✖${NC} ${r}`);
  errores.push(...new Set(rotas));
}

console.log(`\n  ${DIM}${ok}/${GUARDRAILS.length} conectados · ${SUPERFICIE.length} superficies${NC}`);
console.log("\n════════════════════════════════════════════════════════════════");
if (errores.length) {
  console.log(`  ${RED}❌ ${errores.length} problema(s)${NC}`);
  for (const e of errores) console.log(`     ${RED}${e}${NC}`);
  console.log(`\n  ${DIM}Un guardrail que no corre es indistinguible de uno que pasa.${NC}`);
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(1);
}
console.log(`  ${GREEN}✅ Todo guardrail se ejecuta, y todo lo invocado existe${NC}`);
console.log("════════════════════════════════════════════════════════════════");
