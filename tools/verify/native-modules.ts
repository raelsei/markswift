export interface NativeBundle {
  files: Record<string, string>;
  assets?: Record<string, Uint8Array>;
}
export interface ModuleSnapshot { bundle: NativeBundle; moduleID?: string }
export interface NativeModule extends NativeBundle { name: string; resources: string[] }

/** Explicitly shared compileLayouts output is compiled once; independent token namespaces stay separate. */
export function planNativeModules(snapshots: readonly ModuleSnapshot[]): { modules: NativeModule[]; snapshotModules: string[] } {
  const modules: NativeModule[] = [], snapshotModules: string[] = [];
  const shared = new Map<string, NativeModule>();
  for (const snapshot of snapshots) {
    let module = snapshot.moduleID === undefined ? undefined : shared.get(snapshot.moduleID);
    if (module) {
      if (!sameFiles(module.files, snapshot.bundle.files) || !sameAssets(module.assets ?? {}, snapshot.bundle.assets ?? {})) {
        throw new Error(`Conflicting shared native module: ${snapshot.moduleID}`);
      }
    } else {
      const { files, assets = {} } = snapshot.bundle;
      for (const path of [...Object.keys(files), ...Object.keys(assets)]) safePath(path);
      const filePaths = new Set(Object.keys(files).map(path => path.toLowerCase()));
      for (const path of Object.keys(assets)) {
        if (filePaths.has(path.toLowerCase()) || path.toLowerCase().endsWith(".swift")) throw new Error(`Native asset/source collision: ${path}`);
      }
      const resources = [...new Set(["Fonts", ...Object.keys(assets).map(path => path.split("/")[0]!)])].sort();
      module = { name: `Generated${modules.length}`, files, assets, resources };
      modules.push(module);
      if (snapshot.moduleID !== undefined) shared.set(snapshot.moduleID, module);
    }
    snapshotModules.push(module.name);
  }
  return { modules, snapshotModules };
}

function sameFiles(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value);
}
function sameAssets(a: Record<string, Uint8Array>, b: Record<string, Uint8Array>): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, bytes]) => {
    const other = b[key];
    return other !== undefined && bytes.length === other.length && bytes.every((value, index) => value === other[index]);
  });
}
function safePath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") || /^[a-z]:/i.test(path)
    || path.split("/").some(segment => !segment || segment === "." || segment === "..")) throw new Error(`Unsafe native resource path: ${path}`);
}
