import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ConversionResult } from "../../src/index.ts";
import { command } from "../../tools/verify/process.ts";

/** The 12 most recent conversions, kept for ZIP downloads. */
export class ResultStore {
  private results = new Map<string, ConversionResult>();
  constructor(protected directory: string) {}
  /** Entries in use (e.g. a queued native render) are never evicted. */
  protected busy(_id: string): boolean { return false; }
  protected async remove(id: string): Promise<void> {
    this.results.delete(id);
    await rm(join(this.directory, id), { recursive: true, force: true });
  }
  async add(result: ConversionResult): Promise<string> {
    while (this.results.size >= 12) {
      const oldest = [...this.results.keys()].find(id => !this.busy(id));
      if (!oldest) throw new Error("Render queue is full. Wait for the current job to finish.");
      await this.remove(oldest);
    }
    const id = crypto.randomUUID();
    await mkdir(join(this.directory, id), { recursive: true });
    this.results.set(id, result);
    return id;
  }
  get(id: string): ConversionResult {
    const result = this.results.get(id);
    if (!result) throw new Error("Conversion not found or expired. Convert again.");
    return result;
  }
  async download(id: string) {
    const result = this.get(id);
    const folder = join(this.directory, id, "bundle");
    const zip = join(this.directory, id, "component.zip");
    await mkdir(folder, { recursive: true });
    for (const [file, value] of Object.entries({ ...result.files, ...result.assets })) await Bun.write(join(folder, file), value);
    await command(["/usr/bin/zip", "-qr", zip, "."], folder, 15_000);
    return { file: Bun.file(zip), name: result.name };
  }
}
