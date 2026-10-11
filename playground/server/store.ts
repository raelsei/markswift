import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ConversionResult } from "../../src/index.ts";
import { writeBundle } from "../../src/cli/output.ts";
import { command } from "../../tools/verify/process.ts";

const RESULT_DIRECTORY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Removes result directories left by an earlier process; `native/`, `checks/` and anything else stay. */
export async function sweepResults(directory: string): Promise<void> {
  for (const entry of await readdir(directory)) {
    if (RESULT_DIRECTORY.test(entry)) await rm(join(directory, entry), { recursive: true, force: true });
  }
}

/** The 12 most recent conversions, kept for ZIP downloads. */
export class ResultStore {
  private results = new Map<string, ConversionResult>();
  private zips = new Map<string, Promise<string>>();
  constructor(protected directory: string) {}
  /** Entries in use (e.g. a queued native render) are never evicted. */
  protected busy(_id: string): boolean {
    return false;
  }
  protected async remove(id: string): Promise<void> {
    this.results.delete(id);
    this.zips.delete(id);
    await rm(join(this.directory, id), { recursive: true, force: true });
  }
  async add(result: ConversionResult): Promise<string> {
    while (this.results.size >= 12) {
      const oldest = [...this.results.keys()].find((id) => !this.busy(id));
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
  /** Builds the ZIP once per result; concurrent and later downloads share it. */
  async download(id: string) {
    const result = this.get(id);
    let zip = this.zips.get(id);
    if (!zip) {
      zip = this.zip(id, result);
      this.zips.set(id, zip);
    }
    return { file: Bun.file(await zip), name: result.name };
  }
  private async zip(id: string, result: ConversionResult): Promise<string> {
    const folder = join(this.directory, id, "bundle");
    const zip = join(this.directory, id, "component.zip");
    try {
      await writeBundle(result, folder);
      await command(["/usr/bin/zip", "-qr", zip, "."], folder, 15_000);
      return zip;
    } catch (error) {
      this.zips.delete(id);
      await rm(folder, { recursive: true, force: true });
      await rm(zip, { force: true });
      throw error;
    }
  }
}
