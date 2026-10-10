export async function command(args: string[], cwd?: string, timeoutMs = 180_000): Promise<string> {
  const process = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; process.kill(); }, timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
    ]);
    const output = stdout + stderr;
    if (timedOut) throw new Error("Process timed out. Check Xcode and Simulator state, then retry.");
    if (code !== 0) throw new Error(output.slice(-12_000) || `${args[0]} exited with code ${code}`);
    return output;
  } finally { clearTimeout(timer); }
}
