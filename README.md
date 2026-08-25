# guardrails

Comprobaciones de repositorio que **no saben en qué proyecto corren**. Sin dependencias y sin
ningún nombre de proyecto dentro. Dos no necesitan configuración; las otras dos la traen
opcional, con defectos que funcionan.

```bash
npx guardrails worktree      # ¿está el árbol donde debe?
npx guardrails nul           # ¿sigue siendo texto lo que dice ser texto?
npx guardrails refs          # ¿existen las rutas que la documentación cita?
npx guardrails stack         # ¿el stack documentado existe de verdad?
npx guardrails state         # ¿los documentos de estado cumplen lo que dicen?
npx guardrails surface       # ¿el diff cuadra con lo que el commit declaró?
npx guardrails wiring        # ¿los ejecuta alguien, a todos ellos?
```

---

## Por qué existe

Estas comprobaciones vivían duplicadas en `scripts/` de cada proyecto, mantenidas
idénticas byte a byte por un contrato de sincronización. El contrato funcionaba, pero tenía
dos límites que sólo se ven al añadir un tercer proyecto:

| Límite del contrato | Consecuencia |
| --- | --- |
| Compara **árboles de trabajo**, no versiones | Sólo protege a quien tenga todos los repositorios en disco. En una máquina con uno solo, sale en verde sin comprobar nada |
| No puede correr en CI | CI hace checkout de un repositorio; no hay con qué comparar |

Una versión responde mejor que una comparación: `npx guardrails@1.2.0` dice **qué** estás
ejecutando, sin necesitar el otro repositorio delante, y funciona igual en tu portátil y en
CI.

El contrato **no se retiró**: sigue cubriendo los documentos normativos, donde una comparación
sí es el mecanismo correcto porque son prosa que se edita en el sitio. Lo que sale de él es el
código, que es lo que un artefacto versionado hace mejor.

---

## Los comandos

### `worktree`

Mide la posición del árbol frente a `origin` antes de que empieces a escribir: commits sin
empujar, commits sin integrar, archivos sin commitear, antigüedad del último `fetch` y árboles
de trabajo vivos.

```bash
npx guardrails worktree
npx guardrails worktree --fetch            # refresca antes de medir
npx guardrails worktree --max-dirty=40     # sube el umbral (por defecto 30)
```

**Es directo en cualquier repositorio git.** No asume nada del proyecto.

### `nul`

Recorre las carpetas configuradas y falla si un archivo de texto contiene un byte NUL.

Un solo NUL convierte el archivo en binario para `git` y para `grep`: `git show` dice
`Bin 0 -> N bytes` y no se puede revisar en ningún diff, y cualquier `grep -rn` lo salta sin
avisar. Las dos consecuencias son silenciosas, que es lo que lo hace peligroso en un directorio
de guardrails.

```bash
npx guardrails nul
```

> No es el `grep -rlP '\x00'` de una línea. Medido: `grep` sin `-a` trata el binario como
> binario y suprime la salida, así que daba **verde sobre un archivo con NUL dentro**. Y el
> comportamiento depende de la implementación, o sea de la máquina.

### `refs`

Descubre por expresión regular las rutas que la documentación cita y comprueba que existen.
Una ruta rota dentro de una instrucción no es un enlace muerto: es una orden que nadie puede
cumplir.

```bash
npx guardrails refs
```

Dos escapes, los dos declarados **en el propio archivo** y no en una lista dentro del script:

| Escape | Cómo se declara |
| --- | --- |
| El documento registra el pasado y por eso nombra rutas que ya no existen | `refs.historical` en la configuración |
| Todo el documento es ilustrativo (un tutorial, una plantilla) | `<!-- check-refs: ejemplos -->` en su cabecera |
| **Un tramo** del documento nombra rutas para decir que no existen | `<!-- check-refs: ejemplos-desde -->` … `<!-- check-refs: ejemplos-hasta -->` |

El de tramo hace falta más de lo que parece: todo documento de arquitectura nombra rutas
**para decir que no existen** —el anti-ejemplo de YAGNI, la nota de que una carpeta planificada
nunca llegó a crearse, la plantilla de un ADR—. Medido: la primera corrida sobre un proyecto
nuevo dio 7 hallazgos y **los 7 eran de esa clase**. Excluir el archivo entero por eso habría
apagado la comprobación en un documento de 762 líneas lleno de rutas reales.

### `stack`

Contrasta el stack que la documentación **afirma** contra `package.json` y su historia en `git`,
y la configuración ejecutable contra su dato canónico (imagen de base de datos vs `provider`,
`node-version` de CI vs `engines.node` vs `.nvmrc`).

```bash
npx guardrails stack
```

Existe porque una tabla de stack miente sin que nadie lo note. Un proyecto afirmó durante meses
usar una librería de caché para «polling del dashboard» cuando no había una sola llamada en
`src/` y su provider ni siquiera estaba montado — y la afirmación **blindó la dependencia**
frente a la auditoría que sí eliminó otras.

> Un proyecto sin base de datos declara `"schema": null` y ese check se salta con «no aplica».
> Es distinto de que la ruta no exista, que sigue avisando: lo segundo puede ser un esquema
> movido de sitio.

### `state`

Comprueba que los documentos de estado cumplen lo que su **propia prosa** declara. Cuatro
invariantes, y la cuarta es la que suele faltar: **ningún documento puede prohibir un archivo
que sí existe.**

```bash
npx guardrails state
```

Nació de una contradicción que tres guardrails dieron por buena: un documento declaraba que
cierto archivo «no existe», mientras otros cinco lo trataban como legítimo — y el archivo
existía, con historial que nada más cubría. Un agente que leyera el primero lo habría borrado.
Verificar que lo citado existe y verificar que lo prohibido no existe son invariantes opuestas:
la primera no puede detectar la segunda.

Las prohibiciones **se descubren por redacción**, no por lista: cualquier documento que declare
que un archivo no debe existir queda sujeto a que realmente no exista.

> Un proyecto sin documentos de estado declara `"estado": {}`. Los invariantes que dependen de
> ellos se saltan y queda en pie el genérico, que no necesita ninguno.

### `wiring`

El guardrail de los guardrails. Comprueba, en los dos sentidos, que **ninguno está desconectado**
y que nada invoca un comando que no existe.

```bash
npx guardrails wiring
```

> Un guardrail que no ejecuta nadie es **indistinguible de uno que pasa**. No avisa, no falla, no
> aparece en ningún log — simplemente no está.

Ha ocurrido dos veces con coste medido: un guardrail de clases de color vivió semanas sin que
nada lo ejecutara, y otro de documentos de estado faltaba en su workflow durante seis meses —
hueco en el que el documento que vigilaba se pudo borrar dos veces.

Los descubre por glob y por `package.json`: **no lleva ninguna lista dentro**, así que uno nuevo
queda vigilado sin que nadie lo añada. Y reconoce las **tres** formas de invocación que conviven,
porque conocer sólo una miente en la dirección peligrosa —declarar muerto lo que está vivo—:

| Forma | Dónde aparece |
| --- | --- |
| `npm run lint:refs` | Workflows, scripts agregados |
| `node scripts/check-x.mjs` | Hooks que llaman por ruta directa |
| `./node_modules/.bin/guardrails x` · `npx …#tag x` | Hooks rápidos y CI sin `npm ci` |

Comprueba además que **las versiones fijadas no divergen entre sí**. Cada `npx …guardrails#vX`
de un workflow es una copia de lo que `package.json` declara, y las copias sin original divergen
sin que nadie decida: al escribir esta comprobación, un workflow llevaba meses fijado en la
primera versión publicada mientras el resto del repositorio iba cuatro por delante. Nadie lo
notó porque el comando que invocaba no había cambiado — o sea, se habría enterado el día en que
sí importara.

Lo que **no** es una puerta se declara en `wiring.manual` con su razón. Escribir el porqué es lo
que separa una decisión de un olvido: desde fuera, un guardrail desconectado y uno deliberadamente
manual se ven igual.

### `surface`

Comprueba que el número de archivos que el commit declaró en su trailer `Superficie:` cuadra
con su diff real.

```bash
npx guardrails surface
npx guardrails surface --message .git/COMMIT_EDITMSG   # hook commit-msg
npx guardrails surface --range <sha>..<sha>
```

> ⚠️ **Este comando exige una convención, no sólo cablearlo.** Un repositorio cuyos commits no
> lleven el trailer `Superficie: N archivos` fallará en todos ellos desde la primera corrida.
> Adoptarlo es una decisión de proceso: se decide primero, se cablea después.

---

## Configuración

`worktree` y `surface` no la necesitan: operan sobre `git`, que es igual en todas partes.

`nul` y `refs` miran **carpetas**, y ahí los proyectos difieren de verdad — uno tiene las specs
en `docs/specs/` y otro en `specs/` a la raíz. Se declaran en un `guardrails.config.json`
opcional en la raíz del repositorio:

```json
{
  "nul": { "scan": ["docs", "specs", "scripts", "tests", ".github"] },
  "refs": {
    "roots": ["docs/", "specs/", "src/", "scripts/", "tests/", "data/", "public/", ".github/"],
    "historical": []
  },
  "stack": { "ambito": ["README.md", "AGENTS.md", "docs/blueprint.md"], "schema": null }
}
```

Los defectos siguen a la **convención del workspace**: `docs/` y `specs/` en la raíz, workflows
en `.github/workflows`, tabla de stack en `README.md` y `AGENTS.md`. Un proyecto que siga esa
convención no necesita declarar nada; el ejemplo de arriba es un proyecto que se sale de ella en
tres cosas y sólo declara esas tres.

| Clave | Qué es |
| --- | --- |
| `nul.scan` | Carpetas donde buscar bytes NUL |
| `refs.docs` | Carpetas cuyos documentos se leen en busca de rutas citadas |
| `refs.roots` | Prefijos que cuentan como ruta del repositorio. Lo demás entre comillas invertidas —nombres de función, comandos, clases CSS— se ignora |
| `refs.historical` | Expresiones regulares de documentos que registran el pasado y por tanto pueden nombrar rutas que ya no existen |

> Los defectos cubren informes fechados, **archivos** (`docs/audits/archive/`, `docs/prompts/_archived/`), changelogs y runbooks. El de archivo faltaba y dejaba 28 avisos permanentes en un proyecto — ruido que hace que nadie mire los tres que sí importaban.
| `stack.ambito` | Documentos donde vive la tabla de stack que se contrasta con `package.json` |
| `stack.workflows` | Carpeta de workflows cuya configuración ejecutable se compara con el dato canónico |
| `stack.schema` | Esquema del que se lee el motor de base de datos. `null` si el proyecto no tiene |
| `state.docs` · `state.index` | Carpeta de documentos y dónde el proyecto declara su modelo de estado |
| `wiring.dirs` · `wiring.pattern` | Dónde viven los guardrails propios y cómo se llaman |
| `wiring.surfaces` | Dónde puede estar cableado uno. Incluye `.husky/` y `lefthook.yml`: un proyecto usa una familia de hooks y otro la otra |
| `wiring.aggregates` | Scripts npm que cuentan como sitio de ejecución (`verify`) |
| `wiring.manual` | Comandos que no son puertas, con su razón obligatoria |
| `state.estado` | Los documentos de estado y su papel: `siempre` (obligatorio), `abierto` (es el backlog). `{}` si no hay |

**Sin archivo, se usan los defectos**, que son los valores con los que estos guardrails nacieron.
Un proyecto que no configure nada se comporta igual que antes de que existiera este paquete —
que es lo que permitió demostrar que la extracción no cambió nada.

**Una lista declarada reemplaza a la del defecto, no se suma.** Si se sumara, no habría forma de
quitar `prisma/` en un proyecto sin base de datos, y la configuración acabaría siendo la unión
de todos los proyectos que la han tocado. Una clave mal escrita **falla**, no se ignora: un
guardrail que corre con los defectos aparentando estar configurado es verde sin comprobar lo
que se creía.

---

## Cómo se consume

Depende de si hay `node_modules` delante, y la diferencia está **medida**:

| Dónde | Cómo | Tiempo |
| --- | --- | --- |
| Hook de git | `./node_modules/.bin/guardrails <cmd>` | 0,051 s |
| Script de `package.json` | `guardrails <cmd>` — npm pone `.bin` en el `PATH` | 0,051 s |
| CI **sin** `npm ci` | `npx --yes github:<owner>/guardrails#v1.1.0 <cmd>` | ~2 s |

**En hooks no se usa `npx`.** Resolver el paquete por red tarda 2 segundos incluso con la caché
caliente, contra 0,05 de la ruta directa. Dos segundos en cada `git commit` es la clase de
fricción que acaba con el hook desactivado — y además falla sin red.

**En CI sí**, porque hay workflows que deliberadamente no ejecutan `npm ci`: instalar 1,2 GB de
dependencias para leer git haría el job veinte veces más lento. Ahí `npx` compensa, y como este
paquete no tiene dependencias no arrastra árbol.

En los dos casos la versión va **fijada**: el `package-lock.json` para lo local, el tag para CI.
Eso es lo que convierte esto en un mecanismo y no en una copia — un `#main` volvería a dejar sin
respuesta la pregunta de qué se está ejecutando exactamente.

---

## Cómo se prueban

```bash
npm test
```

**46 pruebas, los siete comandos.** Cada una es de **mutación**: inyecta el defecto que el
guardrail dice prevenir y comprueba que lo caza. Una suite que sólo probara el caso bueno pasaría
en verde con el guardrail desactivado — que es exactamente el modo de fallo que este paquete
persigue.

Los comandos se prueban como lo que son: **un proceso que corre en un directorio desechable y
sale con 0 o 1**. Nada de importar el módulo y espiar funciones, que probaría una versión del
guardrail que nadie ejecuta.

> Escribir estas suites encontró **tres defectos** que la mutación manual no había visto: `wiring`
> se saltaba la comprobación inversa en un proyecto sin guardrails propios, `stack` tenía una rama
> muerta que sacaba «sin servicio que comparar» donde había una decisión declarada, y un test
> reveló que el mensaje de ese caso sonaba a fallo. Ninguno rompía nada; los tres habrían
> sobrevivido indefinidamente.

## Cómo se añade un comando

1. El módulo va en `src/`, se ejecuta al importarse y sale con `process.exit`. Lee sus propios
   argumentos de `process.argv.slice(2)`.
2. Se registra en `COMANDOS` de [`bin/guardrails.mjs`](./bin/guardrails.mjs).
3. **Lleva su suite en `test/`, con al menos una prueba de mutación.** Una puerta que no se ha
   visto fallar no está probada.
4. **No puede contener el nombre de ningún proyecto, ni una ruta que sólo exista en uno.** Si
   necesita saber dónde mirar, el dato entra por opción o por convención descubierta, nunca
   cableado.

> Los módulos de `src/` son copias **byte a byte** de los scripts de los que salieron. Esa
> identidad es lo que permitió demostrar que la extracción no cambió el comportamiento:
> misma salida y mismo código de salida sobre el mismo repositorio. Al modificarlos se pierde,
> y a partir de ahí la garantía la dan las pruebas, no el hash.
