import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Authored variable source with default20 distinct from min14 and genuine opsz outline deltas. */
export async function writeOpticalFont(directory: string): Promise<string> {
  const file = join(directory, "optical-source.ttf"), script = join(directory, "optical-source.py");
  await writeFile(script, `from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import newTable
from fontTools.ttLib.tables.TupleVariation import TupleVariation
import sys
fb=FontBuilder(1000,isTTF=True)
fb.setupGlyphOrder([".notdef","space","A"]);fb.setupCharacterMap({32:"space",65:"A"})
glyphs={}
for name in [".notdef","space","A"]:
 pen=TTGlyphPen(None)
 if name=="A":
  pen.moveTo((50,0));pen.lineTo((550,0));pen.lineTo((300,700));pen.closePath()
 glyphs[name]=pen.glyph()
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics({n:(600,0)for n in glyphs});fb.setupHorizontalHeader(ascent=800,descent=-200)
fb.setupNameTable({"familyName":"Original Optical","styleName":"Regular","uniqueFontIdentifier":"OriginalOptical","fullName":"Original Optical","psName":"OriginalOptical"})
fb.setupOS2(sTypoAscender=800,sTypoDescender=-200,usWinAscent=800,usWinDescent=200,usWeightClass=400)
fb.setupPost();fb.setupMaxp();fb.setupFvar([("opsz",14,20,72,"Optical Size"),("wght",100,400,900,"Weight")],[])
gvar=newTable("gvar");gvar.variations={n:[]for n in glyphs}
gvar.variations["A"]=[TupleVariation({"opsz":(0,1,1)},[(0,0),(300,0),(150,0),(0,0),(300,0),(0,0),(0,0)]),TupleVariation({"opsz":(-1,-1,0)},[(0,0),(-200,0),(-100,0),(0,0),(-200,0),(0,0),(0,0)])]
fb.font["gvar"]=gvar;fb.save(sys.argv[1])
`);
  const child = Bun.spawn(["python3", script, file], { stdout: "pipe", stderr: "pipe" });
  const [status, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (status !== 0) throw new Error(error);
  return file;
}
