/** Local-only native rendering on top of ResultStore; the public service never imports this module. */
import { join } from "node:path";
import { renderNative, selectSimulator, type SimulatorInventory } from "../../tools/verify/native.ts";
import { command } from "../../tools/verify/process.ts";
import { ResultStore } from "./store.ts";
import { SerialQueue } from "./queue.ts";

type Status = "idle" | "queued" | "running" | "done" | "error";
interface Job { status: Status; stage: string; error?: string }

/** Startup probe for `/api/capabilities`: true only when a usable iOS Simulator exists. */
export async function nativePreviewAvailable(): Promise<boolean> {
  try {
    const inventory = JSON.parse(await command(["xcrun", "simctl", "list", "devices", "available", "-j"], undefined, 15_000)) as SimulatorInventory;
    selectSimulator(inventory, process.env.MARKSWIFT_SIMULATOR);
    return true;
  } catch { return false; }
}

export class NativeStore extends ResultStore {
  private jobs = new Map<string, Job>();
  private queue = new SerialQueue();
  protected override busy(id: string): boolean {
    const status = this.jobs.get(id)?.status;
    return status === "queued" || status === "running";
  }
  protected override async remove(id: string): Promise<void> {
    this.jobs.delete(id);
    await super.remove(id);
  }
  state(id: string) {
    this.get(id);
    const { status, stage, error } = this.jobs.get(id) ?? { status: "idle", stage: "Waiting for native render." };
    return { id, status, stage, error, imageUrl: status === "done" ? `/api/image/${id}` : undefined };
  }
  render(id: string) {
    const result = this.get(id);
    const current = this.jobs.get(id)?.status;
    if (current === "queued" || current === "running" || current === "done") return this.state(id);
    const job: Job = { status: "queued", stage: "Native render queued…" };
    this.jobs.set(id, job);
    void this.queue.run(async () => {
      job.status = "running";
      try {
        await renderNative(result, join(this.directory, "native"), join(this.directory, id, "preview.png"), stage => { job.stage = stage; });
        job.status = "done";
      } catch (error) {
        job.status = "error";
        job.error = error instanceof Error ? error.message : String(error);
        job.stage = "Native render failed.";
      }
    });
    return this.state(id);
  }
  image(id: string) {
    if (this.jobs.get(id)?.status !== "done") throw new Error("Image is not ready yet.");
    return Bun.file(join(this.directory, id, "preview.png"));
  }
}
