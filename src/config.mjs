// ─── Configuración por proyecto ──────────────────────────────────────────────
//
// POR QUÉ HAY CONFIGURACIÓN AQUÍ Y NO EN `worktree` NI EN `surface`
//
//   Aquellos dos operan sobre `git`, que es igual en todas partes. Éstos dos
//   miran **carpetas**, y ahí los proyectos difieren de verdad: uno tiene las
//   specs en `docs/specs/` y otro en `specs/` a la raíz; uno tiene `prisma/` y
//   otro no. Cablear esa diferencia dentro del script es lo que obligaba a
//   mantener una variante por proyecto.
//
// POR QUÉ UN ARCHIVO Y NO OPCIONES DE LÍNEA DE COMANDOS
//
//   Porque una de las claves es una lista de expresiones regulares —qué
//   documentos son históricos— y eso en un `--flag` dentro de `package.json` es
//   ilegible y se escapa mal. Un JSON se lee, se versiona y se comenta en el
//   diff que lo cambia.
//
// POR QUÉ LOS DEFECTOS SON LOS VALORES QUE YA HABÍA
//
//   Un proyecto que no traiga `guardrails.config.json` se comporta como manda
//   la convención del workspace. Al nacer el paquete los defectos eran, literal,
//   los valores que los scripts traían cableados — así se demostró que trasladar
//   no cambió nada. Desde entonces los defectos siguen al ESTÁNDAR, no al
//   proyecto que los donó: cuando `specs/` en la raíz pasó a ser la ubicación
//   común de los tres proyectos (2026-08-22), entró en los defectos.
//
//   La configuración es para lo que diverge de verdad, no un requisito de
//   entrada: un proyecto que sigue la convención no debería declarar nada.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";

const ARCHIVO = "guardrails.config.json";

const DEFECTOS = {
  nul: {
    // Dónde buscar bytes que rompen un archivo de texto.
    scan: ["docs", "specs", "scripts", ".github"],
  },
  stack: {
    // Documentos donde vive la tabla de stack que se contrasta con package.json.
    ambito: ["README.md", "AGENTS.md", "docs/architecture"],
    // Dónde están los workflows cuya configuración ejecutable se compara con el
    // dato canónico (imagen de BD vs provider, node-version vs engines.node).
    workflows: ".github/workflows",
    // Esquema del que se lee el `provider`. Si no existe, ese check se salta
    // solo: un proyecto sin base de datos no tiene motor que contrastar.
    schema: "prisma/schema.prisma",
    // Nombres más largos que CONTIENEN el de un paquete retirado y NO son ese
    // paquete.
    //
    // El caso que lo hizo necesario: `shadcn` es el CLI de scaffolding, que se
    // ejecuta con `npx` y no se instala; `shadcn/ui` es un sistema de
    // componentes cuyo código se COPIA al repositorio y que nunca fue una
    // dependencia. Al desinstalar el CLI, diez citas correctas a `shadcn/ui`
    // —una de ellas dentro de la URL `ui.shadcn.com`— pasaron a bloquear. No
    // era documentación desactualizada: era una subcadena.
    //
    // Por qué NO se arregla dejando de casar `X` dentro de `X/Y`: eso valdría
    // para éste y crearía falsos NEGATIVOS en el caso opuesto, cuando un
    // documento cita el subcamino de un paquete de verdad retirado
    // (`lodash/debounce`). Y este guardrail prefiere hablar de más a callarse:
    // uno que calla cuando debería hablar es peor que no tenerlo.
    //
    // Declarar uno EXIGE escribir el motivo, igual que `wiring.manual`: es lo
    // que separa una decisión de un olvido, y lo que impide que esta clave
    // acabe siendo el sitio donde se esconde lo que molesta.
    //
    //   "homonimos": {
    //     "shadcn": { "formas": ["shadcn/ui"], "motivo": "…" }
    //   }
    homonimos: {},
  },
  state: {
    docs: "docs",
    // Dónde el proyecto DECLARA qué documentos componen su modelo de estado.
    index: "docs/INDEX.md",
    // Los documentos de estado y su papel.
    //
    // `siempre: true`  → tiene que existir, sin excusa.
    // `siempre: false` → sólo se exige si el índice lo cita. Es lo que evita el
    //                    rojo permanente en un proyecto que no lo usa: un check
    //                    que siempre falla se ignora, y así fue como uno de estos
    //                    documentos llegó a borrarse dos veces.
    // `abierto: true`  → es el backlog. Sobre él se comprueba que no haya casillas
    //                    marcadas (una tarea hecha disfrazada de pendiente) y que
    //                    nombre adónde va lo que se cierra.
    //
    // Un proyecto sin documentos de estado declara `{}`: los invariantes que
    // dependen de ellos se saltan y queda en pie el genérico —nadie prohíbe un
    // archivo que existe—, que no necesita ninguno.
    estado: {
      "TODO.md": { trabajo: "sólo trabajo ABIERTO", siempre: true, abierto: true },
      "CHANGELOG.md": { trabajo: "historial por VERSIÓN (cara al release)", siempre: true },
      "DONE.md": {
        trabajo: "historial por FECHA (trazabilidad, incluye lo previo al CHANGELOG)",
        siempre: false,
      },
    },
  },
  wiring: {
    // Dónde viven los guardrails propios del proyecto, y cómo se llaman.
    dirs: ["scripts"],
    pattern: "^check-[a-z-]+\\.mjs$",
    // Dónde puede estar cableado uno. Se incluyen las dos familias de hooks
    // —husky pone archivos en `.husky/`, lefthook los declara en un YAML— porque
    // un proyecto usa una y otro la otra; la que no exista se salta.
    surfaces: [".husky", ".github/workflows", "lefthook.yml"],
    // Scripts npm que cuentan como sitio de ejecución: la puerta que corre una
    // persona antes de cerrar, y que CI replica.
    aggregates: ["verify"],
    // Comandos que NO son puertas y se ejecutan a mano, con su razón. Declararlo
    // exige escribir por qué, que es lo que separa una decisión de un olvido: un
    // guardrail desconectado y uno deliberadamente manual se ven igual desde
    // fuera, y sólo el segundo tiene explicación.
    manual: {
      worktree:
        "mide la posición del árbol, no el cambio: es chequeo de arranque de sesión",
    },
  },
  refs: {
    // Dónde viven los documentos cuyas rutas citadas se comprueban.
    docs: ["docs", "specs"],
    // Prefijos que son rutas reales del repositorio. Cualquier otra cosa entre
    // comillas invertidas (nombres de función, comandos, clases CSS) se ignora.
    roots: ["docs/", "specs/", "src/", "prisma/", "scripts/", "e2e/", "public/", ".github/"],
    // Documentos que REGISTRAN el pasado y por tanto tienen que poder nombrar
    // rutas que ya no existen. Incluirlos daba 292 falsos positivos en un
    // proyecto y 218 en otro, y un check con ese ruido se ignora entero.
    historical: [
      "^docs/(CHANGELOG|MIGRATION_LOG|DONE|SYNC_MANIFEST)\\.md$",
      "^docs/audits/\\d{4}-\\d{2}-\\d{2}-",
      // Un informe archivado es histórico por definición: audita código que
      // desde entonces cambió, y nombrar rutas que ya no existen es su
      // función. Faltaba, y dejaba 28 avisos permanentes en un proyecto —
      // ruido que hace que nadie mire los tres que sí importaban.
      "^docs/audits/archive/",
      "^docs/case-studies/",
      "^docs/prompts/_archived/",
      "^docs/guides/RUNBOOK-",
    ],
  },
};

/**
 * Devuelve la configuración de un comando: los defectos, con lo que el proyecto
 * declare encima.
 *
 * La fusión es **por clave de primer nivel y reemplaza la lista entera**, no la
 * concatena. Es deliberado: si declarar `roots` añadiera a los defectos, no
 * habría forma de QUITAR `prisma/` en un proyecto sin base de datos, y una
 * configuración de la que sólo se puede añadir acaba siendo la unión de todos
 * los proyectos que la han tocado.
 */
export function cargar(comando) {
  const base = DEFECTOS[comando] ?? {};
  if (!existsSync(ARCHIVO)) return { ...base, _origen: "defectos" };

  let declarado;
  try {
    declarado = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  } catch (e) {
    console.error(`\x1b[0;31m✖ ${ARCHIVO} no es JSON válido: ${e.message}\x1b[0m`);
    process.exit(1);
  }

  const propio = declarado[comando] ?? {};
  const desconocidas = Object.keys(propio).filter((k) => !(k in base));
  if (desconocidas.length) {
    // Una clave mal escrita se ignoraría en silencio y el guardrail correría con
    // los defectos aparentando estar configurado. Es el modo de fallo que este
    // ecosistema persigue: verde sin comprobar lo que se creía.
    console.error(
      `\x1b[0;31m✖ ${ARCHIVO} → "${comando}" declara claves desconocidas: ${desconocidas.join(", ")}\x1b[0m`,
    );
    console.error(`\x1b[2m  Válidas para "${comando}": ${Object.keys(base).join(", ")}\x1b[0m`);
    process.exit(1);
  }

  return { ...base, ...propio, _origen: Object.keys(propio).length ? ARCHIVO : "defectos" };
}
