# guardrails

Comprobaciones de repositorio que **no saben en qué proyecto corren**. Sin dependencias y sin
ningún nombre de proyecto dentro. Dos no necesitan configuración; las otras dos la traen
opcional, con defectos que funcionan.

```bash
npx guardrails worktree      # ¿está el árbol donde debe?
npx guardrails nul           # ¿sigue siendo texto lo que dice ser texto?
npx guardrails refs          # ¿existen las rutas que la documentación cita?
npx guardrails surface       # ¿el diff cuadra con lo que el commit declaró?
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
| Las rutas del documento son ilustrativas (un tutorial, una plantilla) | `<!-- check-refs: ejemplos -->` en su cabecera |

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
    "docs": ["docs", "specs"],
    "roots": ["docs/", "specs/", "src/", "scripts/", "tests/", "data/", "public/", ".github/"],
    "historical": []
  }
}
```

| Clave | Qué es |
| --- | --- |
| `nul.scan` | Carpetas donde buscar bytes NUL |
| `refs.docs` | Carpetas cuyos documentos se leen en busca de rutas citadas |
| `refs.roots` | Prefijos que cuentan como ruta del repositorio. Lo demás entre comillas invertidas —nombres de función, comandos, clases CSS— se ignora |
| `refs.historical` | Expresiones regulares de documentos que registran el pasado y por tanto pueden nombrar rutas que ya no existen |

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

## Cómo se añade un comando

1. El módulo va en `src/`, se ejecuta al importarse y sale con `process.exit`. Lee sus propios
   argumentos de `process.argv.slice(2)`.
2. Se registra en `COMANDOS` de [`bin/guardrails.mjs`](./bin/guardrails.mjs).
3. **No puede contener el nombre de ningún proyecto, ni una ruta que sólo exista en uno.** Si
   necesita saber dónde mirar, el dato entra por opción o por convención descubierta, nunca
   cableado.

> Los módulos de `src/` son copias **byte a byte** de los scripts de los que salieron. Esa
> identidad es lo que permitió demostrar que la extracción no cambió el comportamiento:
> misma salida y mismo código de salida sobre el mismo repositorio. Al modificarlos se pierde,
> y a partir de ahí la garantía la dan las pruebas, no el hash.
