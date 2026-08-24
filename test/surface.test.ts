// ─── surface — el guardrail del trailer `Superficie:` ───────────────────────
// PRIMERA suite de `scripts/`. Nace de `SESS-027`: hasta hoy este script se
// verificaba **a mano**, con clones temporales que se borran al cerrar la
// sesión. Dos mutaciones lo demostraron — una que hace la frontera del clon
// superficial infinita (convierte un rojo real en verde) y otra que silencia
// un aviso de degradación— y **ninguna de las dos hacía fallar nada**.
//
// QUÉ FIJA ESTE ARCHIVO, por orden de lo que cuesta si se rompe:
//
//   · **Un descuadre real sale en rojo.** Es la razón de existir del script; si
//     esto pasa a verde, el guardrail es decorativo.
//   · **Un clon superficial NO produce rojos falsos**, y lo que salta lo dice.
//     Un rojo que no es del autor enseña a ignorar el check, que es la única
//     forma de matarlo.
//   · **Las degradaciones se declaran**: rango irresoluble y frontera ilegible
//     avisan, y dentro de Actions suben a `::warning::` — fuera, no ensucian.
//   · **Las tres formas del contrato** (`N archivos`, `n/a — razón`, trailer en
//     el bloque final) se aceptan o rechazan como el contrato dice.
//
// Son tests de INTEGRACIÓN: crean repositorios git de verdad en un directorio
// temporal y ejecutan el script como proceso. No hay forma honesta de probar
// «se comporta bien en un clon superficial» con mocks — el defecto que motivó
// `SESS-026` vivía justo en la frontera entre el script y git.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// El módulo, no el despachador: la suite prueba el guardrail, y meterle el
// `bin` por delante añadiría al veredicto un componente que no es lo probado.
const SCRIPT = resolve(process.cwd(), "src/surface.mjs");

let raiz: string;

beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), "check-surface-"));
});

afterAll(() => {
  rmSync(raiz, { recursive: true, force: true });
});

// ─── Utilidades ─────────────────────────────────────────────────────────────

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

/** Repositorio nuevo con el guardrail ya «nacido» (`.husky/commit-msg`). */
function crearRepo(nombre: string, opciones: { conNacimiento?: boolean } = {}) {
  const dir = join(raiz, nombre);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@megadatos.co");
  git(dir, "config", "user.name", "test");
  git(dir, "config", "commit.gpgsign", "false");

  if (opciones.conNacimiento !== false) {
    mkdirSync(join(dir, ".husky"), { recursive: true });
    writeFileSync(join(dir, ".husky/commit-msg"), "hook\n");
    git(dir, "add", ".husky/commit-msg");
    git(dir, "commit", "-q", "-m", "chore: nace el guardrail\n\nSuperficie: 1 archivo");
  }
  return dir;
}

/** Commit con N archivos y el mensaje dado, tal cual. */
function commitear(dir: string, mensaje: string, archivos: string[]) {
  for (const a of archivos) {
    writeFileSync(join(dir, a), `${a}\n${Math.random()}\n`);
    git(dir, "add", a);
  }
  git(dir, "commit", "-q", "-m", mensaje);
  return git(dir, "rev-parse", "HEAD").trim();
}

interface Salida {
  code: number;
  out: string;
  err: string;
}

/**
 * La firma de una excepción NO capturada de Node: el banner de versión que
 * imprime al morir. `fatal:` y `error:` no sirven como señal — git los escribe
 * de forma legítima en las degradaciones que estos tests ejercitan a propósito.
 */
const CRASH_DE_NODE = /^Node\.js v\d/m;

/**
 * El script colorea su salida, y los códigos ANSI se cuelan EN MEDIO de las
 * frases (`Commits comprobados:\x1b[0m 1`). Sin limpiarlos, un `toContain` de
 * una frase completa falla aunque el comportamiento sea el correcto.
 */
const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

/**
 * Ejecuta el script y devuelve código de salida + stdout + stderr, sin lanzar…
 * salvo que el script haya MUERTO, que es el único caso en que sí lanza.
 *
 * ⚠️ POR QUÉ CAPTURA `stderr`, Y POR QUÉ ESO ERA UN AGUJERO
 *
 *   La versión anterior usaba `execFileSync` y se quedaba **sólo con stdout**;
 *   `stderr` se heredaba y salía por la pantalla del que corriese la suite. Con
 *   eso, una excepción no capturada del script era invisible para las
 *   aserciones: `.git/shallow` ilegible avisaba, moría con un stack de Node y el
 *   test de `SESS-026` pasaba en VERDE, porque comprobaba los dos textos del
 *   aviso —impresos antes de morir— y nunca el código de salida.
 *
 *   Es el defecto que estos tests existen para impedir, dentro de los tests
 *   mismos: un stack de Node no es un veredicto. `spawnSync` da las tres cosas
 *   en un solo sitio y la guarda de abajo convierte cualquier crash futuro en
 *   un fallo ruidoso, en el test que lo provoque y no en el resumen de la tanda.
 *
 * `env` es `Record<string, string>` y no `NodeJS.ProcessEnv`: en este proyecto
 * el tipo de Next declara `NODE_ENV` como obligatorio, así que un `{}` no es un
 * `ProcessEnv` válido y `tsc` lo rechaza.
 */
function correr(dir: string, args: string[] = [], env: Record<string, string> = {}): Salida {
  const r = spawnSync("node", [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "", ...env },
  });

  const salida: Salida = {
    code: r.status ?? 1,
    out: (r.stdout ?? "").replace(ANSI, ""),
    err: (r.stderr ?? "").replace(ANSI, ""),
  };

  if (CRASH_DE_NODE.test(salida.err)) {
    throw new Error(
      `surface.mjs murió con una excepción no capturada (exit ${salida.code}).\n` +
        `El guardrail no llegó a emitir veredicto: eso no es un rojo, es un crash.\n\n` +
        salida.err,
    );
  }

  return salida;
}

// ═══════════════════════════════════════════════════════════════════════════
// El contrato del trailer
// ═══════════════════════════════════════════════════════════════════════════

describe("contrato del trailer `Superficie:`", () => {
  it("una cifra que cuadra con el diff sale en VERDE", () => {
    const dir = crearRepo("verde");
    commitear(dir, "feat: dos archivos\n\nSuperficie: 2 archivos", ["a.txt", "b.txt"]);

    const { code, out } = correr(dir);

    expect(code).toBe(0);
    expect(out).toContain("✅");
  });

  it("un descuadre real sale en ROJO — si esto se vuelve verde, el guardrail es decorativo", () => {
    const dir = crearRepo("rojo");
    commitear(dir, "feat: dos declarando uno\n\nSuperficie: 1 archivo", ["a.txt", "b.txt"]);

    const { code, out } = correr(dir);

    expect(code).toBe(1);
    expect(out).toContain("descuadre");
    expect(out).toContain("declara 1 archivo(s) y el diff toca 2");
  });

  it("sin trailer, rojo: el commit no declara nada", () => {
    const dir = crearRepo("ausente");
    commitear(dir, "feat: sin declarar", ["a.txt"]);

    const { code, out } = correr(dir);

    expect(code).toBe(1);
    expect(out).toContain("ausente");
  });

  it("`n/a` con motivo es una exención válida; a secas, no", () => {
    const conMotivo = crearRepo("na-ok");
    commitear(conMotivo, "chore: algo\n\nSuperficie: n/a — sólo renombra una rama", ["a.txt"]);
    expect(correr(conMotivo).code).toBe(0);

    const sinMotivo = crearRepo("na-hueco");
    commitear(sinMotivo, "chore: algo\n\nSuperficie: n/a —", ["a.txt"]);
    const { code, out } = correr(sinMotivo);
    expect(code).toBe(1);
    // Sin motivo no llega a ser exención: cae como formato ilegible.
    expect(out).toMatch(/n\/a sin motivo|formato/);
  });

  it("el trailer en el CUERPO no cuenta: un ejemplo del contrato no es una declaración", () => {
    const dir = crearRepo("fuera-de-bloque");
    // La cifra del cuerpo (99) cuadraría con nada; lo que se reporta es la
    // colocación, que es el defecto con el que el guardrail se bloqueó a sí mismo.
    commitear(
      dir,
      "docs: explica el contrato\n\nSuperficie: 99 archivos\n\nY aquí sigue el cuerpo.",
      ["a.txt"],
    );

    const { code, out } = correr(dir);

    expect(code).toBe(1);
    expect(out).toContain("fuera del bloque de trailers");
  });

  it("un revert no necesita trailer: lo redacta git en plena emergencia", () => {
    const dir = crearRepo("revert");
    commitear(dir, 'Revert "feat: algo"\n\nThis reverts commit abc.', ["a.txt"]);

    expect(correr(dir).code).toBe(0);
  });

  it("los commits anteriores al nacimiento del guardrail se saltan y se cuentan aparte", () => {
    const dir = crearRepo("antiguos", { conNacimiento: false });
    commitear(dir, "feat: prehistoria sin contrato", ["viejo.txt"]);
    mkdirSync(join(dir, ".husky"), { recursive: true });
    writeFileSync(join(dir, ".husky/commit-msg"), "hook\n");
    git(dir, "add", ".husky/commit-msg");
    git(dir, "commit", "-q", "-m", "chore: nace el guardrail\n\nSuperficie: 1 archivo");

    const { code, out } = correr(dir, ["--range", "HEAD~1..HEAD"]);

    expect(code).toBe(0);
    // El de prehistoria queda fuera del rango; el del nacimiento sí se comprueba.
    expect(out).toContain("Commits comprobados:");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Degradaciones — el verde que comprueba menos de lo que parece (SESS-013)
// ═══════════════════════════════════════════════════════════════════════════

describe("degradación por rango irresoluble", () => {
  it("avisa y comprueba sólo HEAD en vez de reventar", () => {
    const dir = crearRepo("rango-roto");
    commitear(dir, "feat: uno\n\nSuperficie: 1 archivo", ["a.txt"]);

    const { code, out } = correr(dir, ["--range", `${"0".repeat(40)}..HEAD`]);

    expect(code).toBe(0);
    expect(out).toContain("Rango no resoluble");
    expect(out).toContain("NO se ha comprobado");
  });

  it("dentro de Actions el aviso sube a `::warning::`; fuera NO ensucia el log", () => {
    const dir = crearRepo("rango-roto-ci");
    commitear(dir, "feat: uno\n\nSuperficie: 1 archivo", ["a.txt"]);
    const args = ["--range", `${"0".repeat(40)}..HEAD`];

    const enActions = correr(dir, args, { GITHUB_ACTIONS: "true" });
    const enLocal = correr(dir, args);

    expect(enActions.out).toContain("::warning title=Rango no resoluble");
    expect(enLocal.out).not.toContain("::warning");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Clon superficial — el rojo falso de `SESS-026`
// ═══════════════════════════════════════════════════════════════════════════

describe("clon superficial", () => {
  /** Origen con 3 commits: nacimiento, uno correcto y uno con descuadre. */
  function crearOrigen(nombre: string) {
    const dir = crearRepo(`origen-${nombre}`);
    commitear(dir, "feat: uno bien\n\nSuperficie: 1 archivo", ["a.txt"]);
    commitear(dir, "feat: dos declarando uno\n\nSuperficie: 1 archivo", ["b.txt", "c.txt"]);
    return dir;
  }

  it("el commit de la FRONTERA se salta: su diff aparenta el árbol entero", () => {
    const origen = crearOrigen("d1");
    const clon = join(raiz, "clon-depth1");
    git(raiz, "clone", "--quiet", "--depth", "1", `file://${origen}`, clon);

    const { code, out } = correr(clon);

    // Sin el salto, este commit declara 1 archivo y "toca" los 4 del árbol.
    expect(code).toBe(0);
    expect(out).toContain("Truncados por clon superficial");
    expect(out).not.toContain("descuadre");

    // Y lo saltado se AVISA, no sólo se cuenta. El conteo del resumen y el
    // aviso son dos cosas distintas: comprobar sólo el primero deja pasar que
    // el aviso desaparezca —un mutante que silenciaba `avisarDegradacion`
    // sobrevivía a este test hasta que se añadió esta aserción—.
    const enActions = correr(clon, [], { GITHUB_ACTIONS: "true" });
    expect(enActions.out).toContain("::warning title=1 commit(s) truncado(s)");
  });

  it("pero un descuadre REAL en un commit con padre visible sigue en rojo", () => {
    const origen = crearOrigen("d2");
    const clon = join(raiz, "clon-depth2");
    git(raiz, "clone", "--quiet", "--depth", "2", `file://${origen}`, clon);

    const { code, out } = correr(clon);

    // HEAD no es la frontera aquí: se comprueba entero, y está mal declarado.
    expect(code).toBe(1);
    expect(out).toContain("descuadre");
  });

  it("con la frontera ILEGIBLE avisa, en vez de degradar en silencio (`SESS-026`)", (ctx) => {
    const origen = crearOrigen("ilegible");
    const clon = join(raiz, "clon-ilegible");
    git(raiz, "clone", "--quiet", "--depth", "1", `file://${origen}`, clon);

    const ruta = join(clon, git(clon, "rev-parse", "--git-path", "shallow").trim());
    chmodSync(ruta, 0o000);

    // Ejecutándose como root el chmod no impide leer: el caso no se puede
    // reproducir, y se DICE en vez de pasar en verde sin haber probado nada.
    //
    // ⚠️ La comprobación va fuera del `try` a propósito: `ctx.skip()` aborta
    // lanzando, y meterlo dentro hacía que el propio `catch` se lo tragara y el
    // test siguiera adelante creyéndose la guarda. Cazado al escribirlo.
    let legible = true;
    try {
      readFileSync(ruta, "utf8");
    } catch {
      legible = false;
    }
    if (legible) ctx.skip();

    const { code, out } = correr(clon);

    expect(out).toContain("frontera ilegible");
    expect(out).toContain("el rojo puede no ser tuyo");

    // Y AVISAR NO ES MORIR. Sin la frontera legible, el commit de HEAD —que en
    // un `depth 1` ES la frontera— llegaba a `archivosDe()`, git no podía
    // recorrer sus padres y el script se caía con una excepción no capturada:
    // exit 1, stack de Node y ni veredicto ni resumen.
    //
    // Este test pasaba en verde igualmente, porque las dos aserciones de arriba
    // se cumplen ANTES del crash y `correr()` no miraba stderr ni el código de
    // salida. Las tres líneas de abajo son la diferencia entre comprobar el
    // aviso y comprobar el comportamiento.
    expect(code).toBe(0); // degradar no es fallar (`SESS-013`)
    expect(out).toContain("Truncados por clon superficial");
    expect(out).toContain("Commits comprobados: 0");
  });

  it("saltar la frontera NO es una amnistía general: sólo se salta lo truncado", () => {
    const origen = crearOrigen("amnistia");
    const clon = join(raiz, "clon-amnistia");
    git(raiz, "clone", "--quiet", "--depth", "2", `file://${origen}`, clon);

    const { out } = correr(clon, ["--range", "HEAD~1..HEAD"]);

    // Un solo commit en el rango, y se comprueba: si la frontera se tragara
    // todo, aquí saldría 0 comprobados y verde.
    expect(out).toContain("Commits comprobados: 1");
  });
});
