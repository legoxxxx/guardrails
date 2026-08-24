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
//   Un proyecto que no traiga `guardrails.config.json` se comporta exactamente
//   igual que antes de la extracción. Eso es lo que permite demostrar que
//   trasladar los scripts no cambió nada: misma salida, sin configurar nada.
//   La configuración es para lo que diverge, no un requisito de entrada.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";

const ARCHIVO = "guardrails.config.json";

const DEFECTOS = {
  nul: {
    // Dónde buscar bytes que rompen un archivo de texto.
    scan: ["docs", "scripts", ".github"],
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
  },
  refs: {
    // Dónde viven los documentos cuyas rutas citadas se comprueban.
    docs: ["docs"],
    // Prefijos que son rutas reales del repositorio. Cualquier otra cosa entre
    // comillas invertidas (nombres de función, comandos, clases CSS) se ignora.
    roots: ["docs/", "src/", "prisma/", "scripts/", "e2e/", "public/", ".github/"],
    // Documentos que REGISTRAN el pasado y por tanto tienen que poder nombrar
    // rutas que ya no existen. Incluirlos daba 292 falsos positivos en un
    // proyecto y 218 en otro, y un check con ese ruido se ignora entero.
    historical: [
      "^docs/(CHANGELOG|MIGRATION_LOG|DONE|SYNC_MANIFEST)\\.md$",
      "^docs/audits/\\d{4}-\\d{2}-\\d{2}-",
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
