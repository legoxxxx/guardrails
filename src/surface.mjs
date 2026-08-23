#!/usr/bin/env node
// ─── Check Surface — el diff cuadra con la cifra que el commit declaró ───────
// Ejecutar: npm run lint:surface        · comprueba HEAD
//           npm run lint:surface -- --message .git/COMMIT_EDITMSG
//           npm run lint:surface -- --range <sha>..<sha>
//
// QUÉ HACE CUMPLIR
//
//   §1.8 del orquestador, «Dry-run declarativo»: antes de escribir se enumera la
//   superficie, se dice la cifra, y al cerrar se reconcilia contra el diff. Todo
//   commit declara su superficie con un trailer:
//
//     Superficie: 5 archivos
//     Superficie: 12 archivos / 47 ocurrencias
//     Superficie: n/a — <razón>
//
//   El número de archivos DEBE cuadrar con el diff del propio commit.
//
// POR QUÉ EXISTE, Y NO ES BUROCRACIA (SESS-P1, 2026-08-10)
//
//   La regla llevaba escrita desde el 2026-07-26 y **falló tres veces
//   consecutivas en un solo día**: SESS-005 (12:03) → SESS-006 (15:52) →
//   SESS-P1 (16:30). Las dos primeras se cerraron documentando la lección. No
//   sirvió: reincidió al día siguiente de escribirla, y otra vez cuatro horas
//   después.
//
//   El diagnóstico no es «falta disciplina», y por eso este script no es un
//   castigo. La regla se ignoraba porque **todos sus ejemplos eran codemods**
//   —«47 ocurrencias de `<img>` en 12 archivos»— mientras su letra dice «toda la
//   franja 🟡 y 🔴», o sea casi cualquier sesión que escriba. Ante tres archivos
//   de prosa la regla no disparaba, aunque le aplicase igual.
//
//   Una regla que no dispara sola es prosa. Esto la vuelve mecánica.
//
// ⚠️ LÍMITE DECLARADO — LO QUE ESTO **NO** PUEDE COMPROBAR
//
//   §1.8 tiene tres pasos: (1) enumerar antes, (2) decir la cifra, (3)
//   reconciliar al cerrar. Este guardrail hace obligatorio el (2) y verifica el
//   (3) contra el diff real. **El (1) es inverificable por definición**: el
//   trailer se puede escribir después de tocar los archivos, y ningún script
//   puede distinguirlo.
//
//   Lo que sí consigue: para escribir el número hay que MIRAR, y si no cuadra
//   sale en rojo. Eso convierte «revisar el diff a ojo» en «cuadrarlo contra un
//   número», que es exactamente lo que §1.8 persigue. Decirlo con esta
//   precisión evita el peor resultado posible — creer que el paso 1 está
//   cubierto porque hay un check verde.
//
// DÓNDE CORRE
//
//   · `.husky/commit-msg` — bloquea el commit en local.
//   · `.github/workflows/commits.yml` — **sin filtro `paths:`**, a propósito:
//     `ci.yml` ignora `docs/**` y `docs.yml` sólo mira `docs/**`, así que
//     ninguno de los dos ve todos los commits. Un check de mensajes tiene que
//     ver los de una rama enteros, toquen las rutas que toquen, o no sirve.
//     ⚠️ Sí conserva el filtro de RAMAS (`main`, `development`): una rama de
//     trabajo se comprueba al abrir el PR y al aterrizar, no en cada push
//     (`SESS-012`).
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const RED = "\x1b[0;31m";
const GREEN = "\x1b[0;32m";
const YELLOW = "\x1b[1;33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

const EN_ACTIONS = process.env.GITHUB_ACTIONS === "true";

/** Escapado que exigen los workflow commands de GitHub Actions. */
const escapar = (s) =>
  String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

/**
 * Un aviso de que el check se ha DEGRADADO: sigue en verde, pero ha comprobado
 * menos de lo que su nombre sugiere.
 *
 * ⚠️ POR QUÉ NO BASTA CON `console.log` (`SESS-013`)
 *
 *   Degradar y decirlo es el criterio correcto —el mismo que `check-stack`
 *   aplica al clon superficial: mejor decirlo que fingir—. El problema nunca
 *   fue QUÉ dice, sino DÓNDE: un `console.log` amarillo vive en el log del job,
 *   y **nadie abre el log de un check que salió verde**. Un push de 20 commits
 *   podía pasar con 1 comprobado sin que nada lo delatase fuera del log.
 *
 *   `::warning::` sube el mismo texto al resumen del job y al diff del PR, que
 *   es donde sí se lee. No cambia el veredicto —degradar no es fallar— ni el
 *   código de salida: cambia la visibilidad, que era el defecto.
 *
 * @param titulo  Sin comas ni dos puntos: va en `title=` del workflow command.
 * @param lineas  Detalle para el log local; se une al warning de Actions.
 */
function avisarDegradacion(titulo, lineas = []) {
  console.log(`${YELLOW}⚠️  ${titulo}${NC}`);
  for (const l of lineas) console.log(`${DIM}   ${l}${NC}`);
  console.log("");

  if (EN_ACTIONS) {
    // El título ya lo pinta Actions: repetirlo en el cuerpo sólo lo alarga.
    const cuerpo = lineas.length ? lineas.join(" ") : titulo;
    console.log(`::warning title=${escapar(titulo)}::${escapar(cuerpo)}`);
  }
}

/**
 * El trailer, en las tres formas que el contrato admite.
 *
 * El guion largo de `n/a — razón` se acepta también como `-` y `--`: obligar a
 * un carácter que no está en el teclado convertiría el contrato en una trampa.
 */
const TRAILER = /^[ \t]*Superficie[ \t]*:[ \t]*(.+?)[ \t]*$/im;

/**
 * El valor del trailer, leído con el parser de git y no con una regex sobre todo
 * el mensaje.
 *
 * ⚠️ ESTO NO ES PREFERENCIA DE ESTILO: es un defecto que este guardrail se cazó
 * A SÍ MISMO en su primer uso real. La primera versión hacía `TRAILER.exec()`
 * sobre el mensaje entero y se quedaba con la PRIMERA coincidencia. El commit
 * que lo introducía explicaba el contrato con ejemplos en el cuerpo —
 * `Superficie: 5 archivos`, `Superficie: 12 archivos / 47 ocurrencias`— y el
 * script comparó el diff contra el primer EJEMPLO en vez de contra el trailer
 * real. Bloqueó su propio commit por un descuadre que no existía.
 *
 * `git interpret-trailers --parse` sólo mira el bloque final del mensaje, que es
 * la definición de trailer y la que git usa para `Co-Authored-By`. Un ejemplo en
 * la prosa deja de contar por construcción.
 *
 * Consecuencia del contrato: `Superficie:` va **en el mismo bloque** que
 * `Co-Authored-By:`, sin línea en blanco entre ellos. Si aparece fuera, se
 * detecta aparte para dar un error que lo diga en vez de un «ausente» que
 * despista.
 */
function valorDelTrailer(mensaje) {
  let bloque = "";
  try {
    bloque = execFileSync("git", ["interpret-trailers", "--parse"], {
      input: mensaje,
      encoding: "utf8",
    });
  } catch {
    bloque = ""; // sin git utilizable: cae al diagnóstico de abajo
  }
  const enBloque = TRAILER.exec(bloque);
  if (enBloque) return { valor: enBloque[1].trim(), colocado: true };

  const suelto = TRAILER.exec(mensaje);
  if (suelto) return { valor: suelto[1].trim(), colocado: false };

  return null;
}
const NA = /^n\/a[ \t]*[—–-]+[ \t]*(.+)$/i;
const CIFRA = /^(\d+)[ \t]+archivos?\b/i;

/** Las líneas de comentario que git añade al editor no son parte del mensaje. */
const limpiar = (msg) =>
  msg
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n");

/**
 * Veredicto de un mensaje contra su lista de archivos.
 * Devuelve `null` si está bien, o el motivo del fallo.
 */
function evaluar(mensaje, archivos) {
  const cuerpo = limpiar(mensaje);

  // Un revert lo redacta git, no una persona: exigirle el trailer obliga a
  // editar a mano el camino de emergencia, que es justo cuando no se debe.
  if (/^Revert "/m.test(cuerpo.trimStart())) return null;

  const encontrado = valorDelTrailer(cuerpo);
  if (!encontrado) {
    return {
      tipo: "ausente",
      detalle:
        "el commit no declara su superficie. Añade una línea `Superficie: N archivos` " +
        "—o `Superficie: n/a — <razón>` si de verdad no aplica— en el bloque final, " +
        "junto a `Co-Authored-By`.",
    };
  }
  if (!encontrado.colocado) {
    return {
      tipo: "fuera del bloque de trailers",
      detalle:
        `\`Superficie: ${encontrado.valor}\` aparece en el cuerpo, no en el bloque final. ` +
        "Muévelo junto a `Co-Authored-By`, **sin línea en blanco entre ambos**. Se exige ahí " +
        "porque en el cuerpo un EJEMPLO del contrato se confunde con la declaración real — " +
        "que es el defecto con el que este guardrail bloqueó su propio commit.",
    };
  }

  const valor = encontrado.valor;

  const na = NA.exec(valor);
  if (na) {
    // Se admite la exención, pero con motivo escrito. Un `n/a` a secas sería el
    // agujero por el que se escapa el contrato entero.
    return na[1].trim().length >= 3
      ? null
      : {
          tipo: "n/a sin motivo",
          detalle: "`Superficie: n/a` exige un motivo detrás del guion. Sin él no es una exención, es un hueco.",
        };
  }

  const cifra = CIFRA.exec(valor);
  if (!cifra) {
    return {
      tipo: "formato",
      detalle:
        `\`Superficie: ${valor}\` no se entiende. Formas válidas: ` +
        "`N archivos`, `N archivos / M ocurrencias`, `n/a — <razón>`.",
    };
  }

  const declarado = Number(cifra[1]);
  const real = archivos.length;
  if (declarado === real) return null;

  return {
    tipo: "descuadre",
    detalle:
      `declara ${declarado} archivo(s) y el diff toca ${real}. ` +
      "Si al trabajar cambió la superficie, la cifra se ACTUALIZA y la diferencia se " +
      "explica en el cuerpo — un descuadre sin explicar es un hallazgo (§1.8).",
    archivos,
  };
}

/**
 * El commit en el que nació este guardrail — DESCUBIERTO, no escrito.
 *
 * Todo lo anterior a él es historia legítima sin trailer: exigírselo dejaría el
 * job en rojo permanente por commits que no podían cumplir un contrato que aún
 * no existía, y un guardrail que nace rojo se desactiva el primer día.
 *
 * El corte NO se cablea como SHA porque este ecosistema prohíbe las listas
 * dentro de los scripts, y un SHA a mano es una lista de uno que además miente
 * en cuanto alguien reescriba la historia. Se le pregunta a git cuándo se añadió
 * `.husky/commit-msg`, que es el commit que hizo exigible el contrato.
 */
function commitDeNacimiento(frontera) {
  try {
    const shas = git(
      "log",
      "--diff-filter=A",
      "--format=%H",
      "--",
      ".husky/commit-msg",
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    const sha = shas.at(-1) ?? null; // el más antiguo, si se añadió más de una vez
    // En un clon superficial el commit truncado APARENTA añadir todo el árbol,
    // `.husky/commit-msg` incluido. Aceptarlo como nacimiento fecharía el
    // contrato en el corte del clon y no en su commit real.
    if (sha && frontera.has(sha)) return null;
    return sha;
  } catch {
    return null;
  }
}

/**
 * Los commits que `.git/shallow` declara truncados — la FRONTERA de un clon
 * superficial.
 *
 * ⚠️ POR QUÉ HAY QUE SALTARLOS, Y NO ES UNA CONCESIÓN
 *
 *   Un commit de la frontera no tiene padre visible, así que `git show` le
 *   atribuye **el árbol entero**: 1095 archivos donde su mensaje declara 1. El
 *   descuadre no existe —el commit está bien— pero el check salía ROJO, y sin
 *   decir por qué. Es el reverso del verde silencioso de `SESS-013`: un rojo
 *   falso enseña a ignorar el guardrail, que es la única forma de matarlo.
 *
 *   Saltar SÓLO la frontera no regala cobertura: en un clon con profundidad, el
 *   resto de commits sí tiene diff real y se comprueba entero. Lo que se pierde
 *   es exactamente lo que no se puede medir.
 */
function commitsDeFrontera() {
  let ruta;
  try {
    ruta = git("rev-parse", "--git-path", "shallow").trim();
  } catch {
    return new Set(); // sin git no hay frontera que declarar
  }

  // ⚠️ LA SEÑAL ES EL ARCHIVO, NO LO QUE GIT OPINE. La primera versión de esto
  // preguntaba `git rev-parse --is-shallow-repository`, y **medido el
  // 2026-08-11**: con `.git/shallow` ilegible ese comando responde `false` —no
  // un error—, así que el aviso de abajo quedaba INALCANZABLE justo en el caso
  // que lo motivó (`SESS-026`). Git no puede leer el archivo y concluye que no
  // hay clon superficial; nosotros sí sabemos que existe.
  if (!existsSync(ruta)) return new Set(); // clon completo: no hay frontera

  try {
    return new Set(
      readFileSync(ruta, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  } catch {
    // ⚠️ NO se cae callando (`SESS-026`). Sabemos que el clon es superficial y
    // NO sabemos cuál es su frontera: exactamente el estado en el que el
    // commit truncado se compara contra el árbol entero y sale un rojo que no
    // es del autor. La primera versión de esto devolvía el Set vacío con un
    // «se comporta como hasta ahora» — y «hasta ahora» era el defecto.
    avisarDegradacion(
      `Clon superficial con la frontera ilegible — el rojo puede no ser tuyo`,
      [
        `No se pudo leer \`.git/shallow\`, así que no se sabe qué commits están truncados.`,
        `Un commit sin padre visible declara N archivos y su diff aparenta el árbol entero.`,
      ],
    );
    return new Set();
  }
}

/** ¿`sha` es estrictamente anterior al nacimiento del guardrail? */
function esAnterior(sha, nacimiento) {
  if (!nacimiento || sha === nacimiento) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, nacimiento], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Archivos del índice: es lo que se va a commitear cuando corre `commit-msg`. */
function archivosStaged() {
  return git("diff", "--cached", "--name-only").split("\n").filter(Boolean);
}

/**
 * Un commit cuyos padres git no puede recorrer: no hay diff que medir, así que
 * no hay superficie que comparar. Se distingue de `null` (merge) porque cuenta
 * como truncado y se avisa, mientras un merge simplemente no aplica.
 */
const SIN_PADRE = Symbol("sin-padre-legible");

/** Archivos de un commit ya hecho. Un merge no tiene superficie propia. */
function archivosDe(sha) {
  let padres;
  try {
    padres = git("rev-list", "--parents", "-n", "1", sha).trim().split(/\s+/);
  } catch {
    // ⚠️ `.git/shallow` ES la vía normal de saber qué está truncado, pero NO la
    // única: si no se pudo leer (`SESS-026`), `commitsDeFrontera()` devuelve el
    // Set vacío y el commit de la frontera —que sí lo es— aterriza aquí. git no
    // puede recorrer sus padres y aborta con `status: 128`.
    //
    // Esa excepción no se capturaba y **mataba el script**: avisaba de la
    // degradación y moría con un stack de Node, sin veredicto ni resumen. El
    // comentario de `commitsDeFrontera()` prometía comportarse «como hasta
    // ahora» —un rojo posiblemente ajeno—; lo que hacía era reventar. Medido el
    // 2026-08-11 reproduciendo el caso a mano, porque su propio test pasaba en
    // verde por encima del crash.
    //
    // Sin padre legible el caso es idéntico a la frontera: se cuenta, se avisa
    // y se sigue (`SESS-013` — degradar no es fallar). Sólo se traga ESTE fallo;
    // cualquier otro error de git sigue propagando.
    return SIN_PADRE;
  }
  if (padres.length > 2) return null; // merge: se salta
  return git("show", "--pretty=format:", "--name-only", sha)
    .split("\n")
    .filter(Boolean);
}

// ─── Entrada ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const idx = (f) => argv.indexOf(f);

console.log("════════════════════════════════════════════════════════════════");
console.log("  📐 Check Surface — el diff cuadra con la cifra declarada");
console.log("════════════════════════════════════════════════════════════════\n");

const fallos = [];
let revisados = 0;
let anteriores = 0;
let truncados = 0;

if (idx("--message") !== -1) {
  // ─── Un MERGE pendiente no tiene superficie propia ───────────────────────
  //
  // El modo rango ya exime los merges —`--no-merges` abajo, y `padres.length > 2`
  // en `archivosDelCommit()`—, pero este camino inspecciona un commit que TODAVÍA
  // NO EXISTE, así que no puede mirar sus padres. Sin esta comprobación, el mismo
  // commit recibía veredictos opuestos según cuándo se le preguntara: exento una
  // vez hecho, bloqueado al hacerlo. Una incoherencia interna del guardrail, no
  // una regla.
  //
  // Y no es teórico: bloqueó el merge de `development` en `main` el 2026-08-17,
  // que arrastraba 376 commits. Exigirle «Superficie: N archivos» a un merge es
  // pedir una cifra que no significa nada — su diff es la unión de todo lo que
  // trae, y la declaración existe para cuadrar lo que el AUTOR escribió a mano.
  //
  // `MERGE_HEAD` es la señal canónica de git: existe entre el `git merge` que
  // encuentra conflictos (o `--no-commit`) y el `git commit` que lo cierra.
  //
  // Se consulta con `rev-parse` y no componiendo `.git/MERGE_HEAD` a mano: en un
  // worktree el directorio de git NO es `.git/`, así que la ruta literal fallaría
  // en silencio — daría «no hay merge» y volvería a bloquear.
  const pseudoRef = (ref) => {
    try {
      git("rev-parse", "--verify", "--quiet", ref);
      return true;
    } catch {
      return false;
    }
  };
  const enMerge =
    pseudoRef("MERGE_HEAD") ||
    pseudoRef("CHERRY_PICK_HEAD") ||
    pseudoRef("REVERT_HEAD");

  if (enMerge) {
    console.log(
      `  ${DIM}Commit de merge/cherry-pick/revert: no tiene superficie propia, se salta${NC}`,
    );
    console.log(
      `  ${DIM}(es la misma exención que el modo rango aplica con --no-merges)${NC}\n`,
    );
    console.log(
      "════════════════════════════════════════════════════════════════",
    );
    console.log(`${GREEN}✅ Sin superficie que cuadrar: no aplica${NC}`);
    console.log(
      "════════════════════════════════════════════════════════════════",
    );
    process.exit(0);
  }

  const ruta = argv[idx("--message") + 1];
  const veredicto = evaluar(readFileSync(ruta, "utf8"), archivosStaged());
  revisados = 1;
  if (veredicto) fallos.push({ sha: "(por commitear)", asunto: "", ...veredicto });
} else {
  let shas;
  if (idx("--range") !== -1) {
    const rango = argv[idx("--range") + 1];
    try {
      shas = git("rev-list", "--no-merges", rango).split("\n").filter(Boolean);
    } catch {
      // Rango inválido: primer push de una rama, historia superficial, force-push.
      // Degradar a HEAD es mejor que reventar el job por algo que no es del autor.
      // El aviso sube a `::warning::` porque este camino deja el job VERDE
      // habiendo comprobado un solo commit de la tanda (`SESS-013`).
      avisarDegradacion(`Rango no resoluble — se comprueba sólo HEAD`, [
        `Rango pedido: \`${rango}\` (primer push de una rama, historia superficial o force-push).`,
        `El resto de commits de esta tanda NO se ha comprobado: el verde cubre HEAD y nada más.`,
      ]);
      shas = [git("rev-parse", "HEAD").trim()];
    }
  } else {
    shas = [git("rev-parse", "HEAD").trim()];
  }

  const frontera = commitsDeFrontera();
  const nacimiento = commitDeNacimiento(frontera);
  if (!nacimiento) {
    // Sin poder resolver el corte, comprobar la historia entera daría rojo por
    // commits legítimos. Se dice y se sigue, en vez de fingir un verde.
    avisarDegradacion(`No se pudo resolver cuándo nació este guardrail`, [
      `(clon superficial o sin \`.husky/commit-msg\` en la historia).`,
      `Se comprueban TODOS los commits del rango, incluidos los previos al contrato.`,
    ]);
  }

  for (const sha of shas) {
    if (frontera.has(sha)) {
      truncados++;
      continue; // sin padre visible: su diff sería el árbol entero
    }
    if (esAnterior(sha, nacimiento)) {
      anteriores++;
      continue;
    }
    const archivos = archivosDe(sha);
    if (archivos === SIN_PADRE) {
      truncados++;
      continue; // padres ilegibles: su diff sería el árbol entero
    }
    if (archivos === null) continue; // merge
    revisados++;
    const mensaje = git("log", "-1", "--format=%B", sha);
    const veredicto = evaluar(mensaje, archivos);
    if (veredicto) {
      fallos.push({
        sha: sha.slice(0, 7),
        asunto: git("log", "-1", "--format=%s", sha).trim().slice(0, 72),
        ...veredicto,
      });
    }
  }

  if (truncados) {
    avisarDegradacion(
      `${truncados} commit(s) truncado(s) por clon superficial — sin comprobar`,
      [
        `Están en la frontera del clon: sin padre legible, su diff sería el árbol entero.`,
        `Para comprobarlos hace falta \`fetch-depth: 0\` (ya puesto en commits.yml) o un clon con profundidad.`,
      ],
    );
  }
}

console.log(`  ${DIM}Commits comprobados:${NC} ${revisados}`);
if (truncados)
  console.log(
    `  ${DIM}Truncados por clon superficial (saltados):${NC} ${truncados} ${DIM}— ver §Frontera${NC}`,
  );
if (anteriores)
  console.log(
    `  ${DIM}Anteriores al contrato (saltados):${NC} ${anteriores} ${DIM}— ver §Commit de nacimiento${NC}`,
  );
console.log(`  ${DIM}Con superficie declarada y cuadrada:${NC} ${revisados - fallos.length}\n`);

if (fallos.length) {
  console.log(`${RED}❌ ${fallos.length} commit(s) sin cuadrar su superficie${NC}`);
  console.log(`${DIM}   §1.8 del orquestador: antes de escribir se dice la cifra; al cerrar${NC}`);
  console.log(`${DIM}   se reconcilia. Sin eso el diff se revisa a ojo, que es lo que falló${NC}`);
  console.log(`${DIM}   tres veces seguidas el 2026-08-10 (SESS-005 · SESS-006 · SESS-P1).${NC}\n`);
  for (const f of fallos) {
    console.log(`  ${RED}✖${NC} ${f.sha}${f.asunto ? ` ${DIM}${f.asunto}${NC}` : ""}`);
    console.log(`     ${f.tipo}: ${f.detalle}`);
    if (f.archivos) {
      for (const a of f.archivos.slice(0, 12)) console.log(`       ${DIM}· ${a}${NC}`);
      if (f.archivos.length > 12)
        console.log(`       ${DIM}… y ${f.archivos.length - 12} más${NC}`);
    }
    console.log("");
  }
  console.log("════════════════════════════════════════════════════════════════");
  process.exit(1);
}

console.log("════════════════════════════════════════════════════════════════");
console.log(`${GREEN}✅ Cada commit declara su superficie, y cuadra con su diff${NC}`);
console.log("════════════════════════════════════════════════════════════════");
