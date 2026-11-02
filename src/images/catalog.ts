/** Emits an Assets.xcassets imageset structure with Contents.json from Images/ assets. */

export function toAssetCatalog(assets: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  const groups = new Map<string, Map<number, { filename: string; bytes: Uint8Array }>>();

  for (const [path, bytes] of Object.entries(assets)) {
    if (!path.startsWith("Images/")) {
      result[path] = bytes;
      continue;
    }
    const filename = path.slice("Images/".length);
    const match = /^(.+?)(?:@([1-3])x)?\.([a-zA-Z0-9]+)$/.exec(filename);
    if (!match) {
      result[path] = bytes;
      continue;
    }
    const base = match[1]!;
    const scale = match[2] ? parseInt(match[2], 10) : 1;
    const group = groups.get(base) ?? new Map<number, { filename: string; bytes: Uint8Array }>();
    group.set(scale, { filename, bytes });
    groups.set(base, group);
  }

  // Root Assets.xcassets/Contents.json
  const rootContents = {
    info: {
      author: "xcode",
      version: 1,
    },
  };
  result["Assets.xcassets/Contents.json"] = new TextEncoder().encode(JSON.stringify(rootContents, null, 2) + "\n");

  for (const [base, group] of groups) {
    const imagesetDir = `Assets.xcassets/${base}.imageset`;
    const images: Array<{ idiom: string; scale: string; filename?: string }> = [
      {
        idiom: "universal",
        scale: "1x",
        ...(group.has(1) ? { filename: group.get(1)!.filename } : {}),
      },
      {
        idiom: "universal",
        scale: "2x",
        ...(group.has(2) ? { filename: group.get(2)!.filename } : {}),
      },
      {
        idiom: "universal",
        scale: "3x",
        ...(group.has(3) ? { filename: group.get(3)!.filename } : {}),
      },
    ];

    const imagesetContents = {
      images,
      info: {
        author: "xcode",
        version: 1,
      },
    };

    result[`${imagesetDir}/Contents.json`] = new TextEncoder().encode(JSON.stringify(imagesetContents, null, 2) + "\n");

    for (const [, { filename, bytes }] of group) {
      result[`${imagesetDir}/${filename}`] = bytes;
    }
  }

  return result;
}
