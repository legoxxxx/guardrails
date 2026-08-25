// ─── worktree — el árbol está donde debe ─────────────────────────────────────
//
// Es el único comando que no juzga el CAMBIO sino el ENTORNO, y por eso no es
// una puerta: se ejecuta al abrir sesión. Sus pruebas montan repositorios git de
// verdad, porque lo que mide sale de `git` y no de leer archivos.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { crearFixture, borrar, escribir, correr } from "./ayudantes";

let dir: string;
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function repo(): string {
  const d = crearFixture("worktree");
  git(d, "init", "-q", "-b", "main");
  git(d, "config", "user.email", "t@t.t");
  git(d, "config", "user.name", "T");
  escribir(d, "a.txt", "uno\n");
  git(d, "add", "a.txt");
  git(d, "commit", "-q", "-m", "inicial");
  return d;
}

beforeEach(() => {
  dir = repo();
});
afterEach(() => borrar(dir));

describe("worktree", () => {
  it("pasa en un árbol limpio", () => {
    expect(correr("worktree", dir).code).toBe(0);
  });

  it("informa de los archivos sin commitear", () => {
    escribir(dir, "b.txt", "dos\n");
    const r = correr("worktree", dir);
    expect(r.out).toMatch(/Sin commitear/);
  });

  it("CAZA una tanda que crece por encima del umbral", () => {
    // No es una puerta de calidad: es que veinte archivos sueltos ya no son una
    // sesión en curso, son una fusión pendiente que crece.
    for (let i = 0; i < 6; i++) escribir(dir, `f${i}.txt`, "x\n");
    const r = correr("worktree", dir, ["--max-dirty=3"]);
    expect(r.code, "seis archivos sobre un umbral de tres").toBe(1);
  });

  it("el umbral se puede subir a conciencia", () => {
    for (let i = 0; i < 6; i++) escribir(dir, `f${i}.txt`, "x\n");
    expect(correr("worktree", dir, ["--max-dirty=50"]).code).toBe(0);
  });

  it("no revienta sin remoto configurado", () => {
    // Degradación: un repositorio local sin `origin` es el caso de quien acaba
    // de clonar o de un fixture de CI. Un guardrail que muere ahí no lo adopta
    // nadie.
    const r = correr("worktree", dir);
    expect(r.err).not.toMatch(/TypeError|Cannot read/);
  });
});
