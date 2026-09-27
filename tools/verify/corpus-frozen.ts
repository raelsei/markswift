import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createSourceSnapshot, verifySourceSnapshot } from "./corpus-snapshot.ts";

const [target, ...args] = process.argv.slice(2);
if (target !== "corpus" && target !== "interactions") {
  console.log("Usage: bun tools/verify/corpus-frozen.ts corpus|interactions [ordinary harness options]\nThe command copies converter, helpers, resources and dependencies before launching the copied harness.\nInteraction execution must use the same snapshot's copied corpus-interactions.ts entry after preparation.");
  if (target && target !== "--help") process.exitCode = 1;
} else {
  if (args.some(arg => arg === "--execute" || arg.startsWith("--execute="))) throw new Error("Execute interactions with the same prepared snapshot entry; do not create a different source snapshot");
  const cwd = resolve(import.meta.dir, "../.."), root = join(cwd, "out/goal/source-snapshots");
  await mkdir(root, { recursive: true });
  const directory = join(root, new Date().toISOString().replaceAll(/[:.]/g, "-"));
  const snapshot = await createSourceSnapshot(cwd, directory);
  const outputFlag = args.findIndex(arg => arg === "--output" || arg.startsWith("--output="));
  const forwarded = [...args];
  if (outputFlag < 0) forwarded.push("--output", join(cwd, `out/goal/${target === "corpus" ? "corpus" : "interactions"}`));
  else if (forwarded[outputFlag] === "--output") {
    if (!forwarded[outputFlag + 1]) throw new Error("--output requires a directory");
    forwarded[outputFlag + 1] = resolve(cwd, forwarded[outputFlag + 1]!);
  } else forwarded[outputFlag] = `--output=${resolve(cwd, forwarded[outputFlag]!.slice("--output=".length))}`;
  const entry = join(directory, `tools/verify/${target === "corpus" ? "corpus.ts" : "corpus-interactions.ts"}`);
  console.log(`Frozen source: ${directory}\nSource SHA256: ${snapshot.sourceHash}\nDependency SHA256: ${snapshot.dependencyHash}\nCopied entry: ${entry}`);
  const child = Bun.spawn([process.execPath, entry, ...forwarded], { cwd: directory, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  await verifySourceSnapshot(directory);
  process.exitCode = exitCode;
}
