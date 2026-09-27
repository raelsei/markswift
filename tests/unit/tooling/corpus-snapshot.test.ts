import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sourceDigest } from "../../../tools/verify/corpus-source.ts";
import { createSourceSnapshot, verifySourceSnapshot } from "../../../tools/verify/corpus-snapshot.ts";

test("frozen execution uses copied source, Python helpers, resources and dependency bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-snapshot-")), source = join(directory, "source"), copy = join(directory, "copy");
  await mkdir(join(source, "src/fonts"), { recursive: true });
  await mkdir(join(source, "tools/verify"), { recursive: true });
  await mkdir(join(source, "node_modules/example"), { recursive: true });
  await mkdir(join(source, "node_modules/.bin"), { recursive: true });
  try {
    for (const path of ["bun.lock", "tsconfig.json", "tsconfig.build.json"]) await writeFile(join(source, path), "{}");
    await writeFile(join(source, "package.json"), JSON.stringify({ name: "markswift", type: "module", exports: "./src/value.ts" }));
    await writeFile(join(source, "src/value.ts"), "export default 'copied';");
    await writeFile(join(source, "src/fonts/convert-font.py"), "value = 1\n");
    await writeFile(join(source, "src/fonts/font.bin"), new Uint8Array([0, 255, 128]));
    await writeFile(join(source, "tools/verify/entry.ts"), "import value from 'markswift'; console.log(value);");
    await writeFile(join(source, "node_modules/example/index.js"), "module.exports = 1;");
    await symlink("../example/index.js", join(source, "node_modules/.bin/example"));
    await symlink(source, join(source, "node_modules/markswift"));
    const before = await sourceDigest(source);
    await writeFile(join(source, "src/fonts/convert-font.py"), "value = 2\n");
    expect(await sourceDigest(source)).not.toBe(before);
    const pythonHash = await sourceDigest(source);
    await writeFile(join(source, "src/fonts/font.bin"), new Uint8Array([0, 255, 129]));
    expect(await sourceDigest(source)).not.toBe(pythonHash);
    const snapshot = await createSourceSnapshot(source, copy);
    expect(snapshot.files["src/fonts/convert-font.py"]).toBeDefined();
    expect(snapshot.files["src/fonts/font.bin"]).toBeDefined();
    expect(await realpath(join(copy, "node_modules/markswift"))).toBe(await realpath(copy));
    await writeFile(join(source, "src/value.ts"), "export default 'edited';");
    await writeFile(join(source, "node_modules/example/index.js"), "module.exports = 2;");
    expect((await verifySourceSnapshot(copy)).sourceHash).toBe(snapshot.sourceHash);
    const process = Bun.spawn([processExec(), join(copy, "tools/verify/entry.ts")], { stdout: "pipe", stderr: "pipe" });
    expect((await new Response(process.stdout).text()).trim()).toBe("copied"); expect(await process.exited).toBe(0);
    expect(await readFile(join(copy, "node_modules/example/index.js"), "utf8")).toBe("module.exports = 1;");
    await writeFile(join(copy, "node_modules/example/index.js"), "changed");
    await expect(verifySourceSnapshot(copy)).rejects.toThrow("dependency snapshot changed");
    await writeFile(join(copy, "node_modules/example/index.js"), "module.exports = 1;");
    const path = join(copy, "src/fonts/convert-font.py"); await chmod(path, 0o644); await writeFile(path, "changed");
    await expect(verifySourceSnapshot(copy)).rejects.toThrow("source snapshot changed");
    await symlink(directory, join(source, "node_modules/escape"));
    await expect(createSourceSnapshot(source, join(directory, "unsafe"))).rejects.toThrow("Dependency link escapes snapshot");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source helper symlinks are rejected instead of silently omitted by file-only globs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-source-link-"));
  try {
    for (const path of ["package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json"]) await writeFile(join(directory, path), "{}");
    await mkdir(join(directory, "src/fonts"), { recursive: true });
    await mkdir(join(directory, "tools/verify"), { recursive: true });
    await writeFile(join(directory, "helper.py"), "value = 1\n");
    await symlink("../../helper.py", join(directory, "src/fonts/convert-font.py"));
    await expect(sourceDigest(directory)).rejects.toThrow("Source symlink is unsupported: src/fonts/convert-font.py");
    await expect(createSourceSnapshot(directory, join(directory, "copy"))).rejects.toThrow("Source symlink is unsupported");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
const processExec = (): string => process.execPath;

test("a linked dependency root cannot reconnect the snapshot to mutable dependencies", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-dependency-root-"));
  try {
    for (const path of ["package.json", "bun.lock", "tsconfig.json", "tsconfig.build.json"]) await writeFile(join(directory, path), "{}");
    await mkdir(join(directory, "src")); await mkdir(join(directory, "tools/verify"), { recursive: true });
    await mkdir(join(directory, "mutable")); await symlink("mutable", join(directory, "node_modules"));
    await expect(createSourceSnapshot(directory, join(directory, "copy"))).rejects.toThrow("Dependency root must be a real directory");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("transitive self-package links cannot hide escapes behind dot-dot traversal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "markswift-transitive-dependency-")), source = join(directory, "source");
  try {
    await mkdir(join(source, "src"), { recursive: true }); await mkdir(join(source, "tools/verify"), { recursive: true });
    await mkdir(join(source, "node_modules"));
    for (const path of ["bun.lock", "tsconfig.json", "tsconfig.build.json"]) await writeFile(join(source, path), "{}");
    await writeFile(join(source, "package.json"), JSON.stringify({ name: "markswift" }));
    await writeFile(join(directory, "outside.js"), "mutable outside bytes");
    // A lexical-only resolver sees this harmless decoy instead of the actual external file.
    await writeFile(join(source, "node_modules/outside.js"), "inside decoy");
    await symlink(source, join(source, "node_modules/markswift"));
    await symlink("markswift/../outside.js", join(source, "node_modules/escape.js"));
    expect(await readFile(join(source, "node_modules/escape.js"), "utf8")).toBe("mutable outside bytes");
    await expect(createSourceSnapshot(source, join(directory, "unsafe"))).rejects.toThrow("Dependency link escapes snapshot: escape.js");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
