# guardrails

Comprobaciones de repositorio que **no saben en qué proyecto corren**. Sin dependencias, sin
configuración y sin ningún nombre de proyecto dentro.

```bash
npx guardrails worktree      # ¿está el árbol donde debe?
npx guardrails surface       # ¿el diff cuadra con lo que el commit declaró?
```

---

## Por qué existe

Estas dos comprobaciones vivían duplicadas en `scripts/` de cada proyecto, mantenidas
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

## Instalación

No hay. `npx` descarga el paquete y lo ejecuta; no tiene dependencias, así que no arrastra
árbol.

Eso es deliberado y tiene un motivo medido: el workflow que corre estas comprobaciones en uno
de los proyectos consumidores no ejecuta `npm ci` —instalar 1,2 GB de dependencias para leer
git haría el job veinte veces más lento—. Un paquete como `dependency` obligaría a instalarlas;
invocado con `npx`, no.

Fijar la versión es lo que convierte esto en un mecanismo y no en una copia:

```yaml
- run: npx --yes guardrails@1.0.0 worktree
```

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
