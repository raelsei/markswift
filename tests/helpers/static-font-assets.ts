import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Small valid source fonts for packaging tests; no downloaded or production font assets. */
export async function writeStaticFont(directory: string, weight: number, names: { family?: string; postScriptName?: string } = {}): Promise<string> {
  const file = join(directory, `source-${weight}.ttf`);
  const script = join(directory, `build-${weight}.py`);
  await writeFile(script, `from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
import sys
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder([".notdef", "space", "A"])
fb.setupCharacterMap({32: "space", 65: "A"})
glyphs = {}
for name in [".notdef", "space", "A"]:
    pen = TTGlyphPen(None)
    if name == "A":
        pen.moveTo((50, 0)); pen.lineTo((550, 0)); pen.lineTo((300, 700)); pen.closePath()
    glyphs[name] = pen.glyph()
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics({name: (600, 0) for name in glyphs})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({"familyName": ${JSON.stringify(names.family ?? "Original Test Family")}, "styleName": "Regular" if ${weight} == 400 else "Bold", "uniqueFontIdentifier": "Original-${weight}", "fullName": "Original Test ${weight}", "psName": ${JSON.stringify(names.postScriptName ?? `OriginalTest-${weight}`)}})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, usWeightClass=${weight})
fb.setupPost(); fb.setupMaxp(); fb.save(sys.argv[1])
`);
  const process = Bun.spawn(["python3", script, file], { stdout: "pipe", stderr: "pipe" });
  const [status, errors] = await Promise.all([process.exited, new Response(process.stderr).text()]);
  if (status !== 0) throw new Error(`fontTools test fixture failed: ${errors}`);
  return file;
}
