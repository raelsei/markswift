import json, sys
from fontTools.ttLib import TTFont

src, dst, family, subfamily, want_rename = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == "1"
# A render/generate replay must not rewrite head.modified to the wall clock.
font = TTFont(src, recalcTimestamp=False)
flavor = font.flavor
name = font["name"]
names = {i: name.getDebugName(i) for i in (1, 2, 4, 6, 16, 17)}
renamed = False
# The registered name is the file's, not the CSS one: shadcn's 'Geist Variable' is a file whose
# name table says 'Geist', so `Font.custom("Geist Variable")` would silently render in SF Pro.
# Rewriting the name table here keeps the CSS family name the single name the whole pipeline
# uses, instead of teaching the emitter a second naming convention. Stale records for the same
# ids are dropped first so no platform-specific leftover can win the lookup.
if want_rename and family not in {v for v in names.values() if v}:
    ps = "".join(c for c in family if c.isalnum()) + ("-" + subfamily if subfamily != "Regular" else "")
    full = family if subfamily == "Regular" else family + " " + subfamily
    ids = (1, 2, 4, 6, 16, 17) if "fvar" in font else (1, 2, 4, 6)
    name.names = [n for n in name.names if n.nameID not in ids]
    for platform, encoding, lang in ((3, 1, 0x409), (1, 0, 0)):
        name.setName(family, 1, platform, encoding, lang)
        name.setName(subfamily, 2, platform, encoding, lang)
        name.setName(full, 4, platform, encoding, lang)
        name.setName(ps[:63], 6, platform, encoding, lang)
        if "fvar" in font:
            name.setName(family, 16, platform, encoding, lang)
            name.setName(subfamily, 17, platform, encoding, lang)
    renamed = True
if flavor is not None:
    font.flavor = None
if renamed or flavor is not None:
    font.save(dst)
os2, hhea, head = font["OS/2"], font["hhea"], font["head"]
typo = bool(os2.fsSelection & (1 << 7)) and os2.version >= 4
print(json.dumps({
    "upem": head.unitsPerEm,
    "ascent": os2.sTypoAscender if typo else hhea.ascender,
    "descent": abs(os2.sTypoDescender if typo else hhea.descender),
    "lineGap": os2.sTypoLineGap if typo else hhea.lineGap,
    "useTypoMetrics": typo,
    "axes": {a.axisTag: [a.minValue, a.maxValue] for a in font["fvar"].axes} if "fvar" in font else {},
    "converted": flavor is not None,
    "renamed": renamed,
    "wrote": renamed or flavor is not None,
}))
