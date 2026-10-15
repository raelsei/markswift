import { expect, test } from "bun:test";
import { convert, convertHtml } from "../../src/index.ts";
import { readdir } from "node:fs/promises";
import {
  GRID_RADIO,
  GRID_RADIO_CSS,
  ICONS,
  ICONS_CSS,
  PREFS,
  PREFS_CSS,
  SETTINGS,
  SETTINGS_CSS,
  TEAM,
  TEAM_CSS,
} from "../helpers/component-fixtures.ts";

const browserTest = process.env.MARKSWIFT_BROWSER_TESTS === "1" ? test : test.skip;
const LIST24 = "tests/conformance/fixtures/components/shadcn-list-24.html";
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

browserTest(
  "a 24-row list is one ForEach over 24 data rows",
  async () => {
    const { code } = await convert({ file: LIST24 }, { name: "List24" });
    expect(count(code, /ForEach\(/g)).toBe(1);
    expect(code.split("\n").length).toBeLessThanOrEqual(200);
    expect(count(code, /private var v_/g)).toBeLessThanOrEqual(6);
    expect(code).toContain("static let items: [Item] = [");
    expect(count(code, /^\s+Item\(id: /gm)).toBe(24);
  },
  60000,
);

browserTest(
  "extraction is deterministic across conversions",
  async () => {
    const a = await convert({ file: LIST24 }, { name: "List24" });
    const b = await convert({ file: LIST24 }, { name: "List24" });
    expect(b.files).toEqual(a.files);
  },
  60000,
);

browserTest(
  "rows with controls bind through ForEach($rows) and collapse their actions",
  async () => {
    const { code } = await convertHtml(SETTINGS, { name: "Settings", css: SETTINGS_CSS });
    expect(code).toContain("ForEach($emailItems) { $emailItem in");
    expect(code).toContain("@Binding var emailItem: EmailItem");
    expect(code).toContain("$emailItem.isOn");
    expect(code).toContain("emailItem.isOn.toggle()");
    expect(count(code, /var on\w+: \(EmailItem\) -> Void = \{ _ in \}/g)).toBe(1);
    const action = code.match(/var (on\w+): \(EmailItem\) -> Void = \{ _ in \}/)![1]!;
    expect(code).toContain(`{ ${action}(emailItem) }`);
    expect(count(code, /var onSave: \(\) -> Void = \{\}/g)).toBe(1);
  },
  60000,
);

browserTest(
  "differing icons become AnyShape fields",
  async () => {
    const { code } = await convertHtml(ICONS, { name: "Icons", css: ICONS_CSS });
    expect(code).toContain("var icon: AnyShape");
    expect(count(code, /AnyShape\(MarkswiftShape_/g)).toBe(3);
    expect(code).toMatch(/row\.icon\.(fill|stroke)\(/);
  },
  60000,
);

browserTest(
  "grid tiles are unrolled calls and radio rows pass their group binding through",
  async () => {
    const { code } = await convertHtml(GRID_RADIO, { name: "GridRadio", css: GRID_RADIO_CSS });
    expect(code).not.toContain("ForEach(ts)");
    expect(code).toContain("TView(t: Self.ts[3]");
    expect(code).toMatch(/@Binding var (?!s_)\w+: String/);
    expect(code).toMatch(/: \$s_\w+/);
  },
  60000,
);

browserTest(
  "annotated markup names the component, its fields and the screen init",
  async () => {
    const team = (await convertHtml(TEAM, { name: "TeamCard", css: TEAM_CSS })).code;
    for (const s of [
      "struct Member: Identifiable",
      "struct MemberView: View",
      "var members: [Member] = Self.members",
      "var name: String",
      "var role: String",
      'var title: String = "Team members"',
      "var onMessage: (Member) -> Void = { _ in }",
      'init(members: [Member] = Self.members, title: String = "Team members", onMessage: @escaping (Member) -> Void = { _ in })',
    ])
      expect(team).toContain(s);
    const settings = (await convertHtml(PREFS, { name: "SettingsCard", css: PREFS_CSS })).code;
    for (const s of [
      "@State private var preferences: [Preference]",
      "_preferences = State(initialValue: preferences)",
      "@Binding var preference: Preference",
      "var isOn: Bool",
      '#Preview("SettingsCard.PreferenceView")',
      "@Previewable @State var preference",
    ])
      expect(settings).toContain(s);
  },
  60000,
);

const column = (items: string) =>
  `<div data-markswift-root style="width:300px;padding:12px;display:flex;flex-direction:column;gap:8px;font:15px system-ui;background:#fff;color:#111">${items}</div>`;
const fruit = (style: (i: number) => string) =>
  column(
    ["Apples", "Pears", "Plums", "Figs"]
      .map((t, i) => `<div style="padding:8px;background:#eef${style(i)}">${t}</div>`)
      .join(""),
  );

browserTest(
  "equal leaf rows are one ForEach; a mixed leaf run stays unrolled",
  async () => {
    const { code } = await convertHtml(
      fruit(() => ""),
      { name: "Fruit" },
    );
    expect(count(code, /ForEach\(/g)).toBe(1);
    expect(count(code, /^\s+Item\(id: /gm)).toBe(4);
    expect(code).toContain("Text(verbatim: item.text)");
    expect(code).not.toContain('Text(verbatim: "Pears")');
    // Every other row bold: no two adjacent rows are equal.
    const mixed = (
      await convertHtml(
        fruit((i) => (i % 2 ? ";font-weight:700" : "")),
        { name: "Fruit" },
      )
    ).code;
    expect(mixed).not.toContain("ForEach(");
    expect(mixed).toContain('Text(verbatim: "Pears")');
  },
  60000,
);

browserTest(
  "a run of buttons is one ForEach with one per-row action named for the row",
  async () => {
    const html = column(["Day", "Week", "Month"].map((t) => `<button type="button">${t}</button>`).join(""));
    const { code } = await convertHtml(html, { name: "Range" });
    expect(count(code, /ForEach\(/g)).toBe(1);
    const actions = [...code.matchAll(/var (on\w+): \((\w+)\) -> Void = \{ _ in \}/g)];
    expect(actions.map((m) => m[1])).toEqual([`on${actions[0]![2]}`]);
    expect(code).not.toMatch(/onDay|onWeek|onMonth/);
  },
  60000,
);

const CORPUS = "tests/conformance/fixtures/components";
const corpus = async () => (await readdir(CORPUS)).filter((f) => f.endsWith(".html")).sort();

browserTest(
  "K1: no private-style name reaches a non-private member or an init over the component corpus",
  async () => {
    const leaks: string[] = [];
    for (const f of await corpus()) {
      const { files } = await convert({ file: `${CORPUS}/${f}` });
      for (const [file, text] of Object.entries(files))
        for (const line of text.split("\n"))
          if (
            (/\b(?:var|let|func)\s+(?:v|s|on)_\w+/.test(line) && !line.includes("private")) ||
            (/\binit\(/.test(line) && /\b(?:v|s|on)_\w+:/.test(line))
          )
            leaks.push(`${f} ${file}: ${line.trim()}`);
    }
    expect(leaks).toEqual([]);
  },
  300000,
);

/** Every extracted name, checked by eye against the markup; a rule change shows up here as a renamed API. */
// shadcn-avatar: three avatar runs (`data-slot="avatar"`) differ in shape, so three types. tw-cards: the
// nearest heading of the member cards is the following "Invite a teammate" card's (Step 2 rule order).
const GOLDEN: Record<string, { types: string[]; views: string[]; arrays: string[]; actions: string[] }> = {
  "overlay-collapsible": {
    types: ["Item", "Item2"],
    views: ["ItemView", "Item2View"],
    arrays: ["items", "items2"],
    actions: [],
  },
  "shadcn-avatar": {
    types: ["Avatar", "Avatar2", "Avatar3"],
    views: ["AvatarView", "Avatar2View", "Avatar3View"],
    arrays: ["avatars", "avatars2", "avatars3"],
    actions: [],
  },
  "shadcn-list-24": { types: ["Item"], views: ["ItemView"], arrays: ["items"], actions: [] },
  "shadcn-table": { types: ["TableRow"], views: ["TableRowView"], arrays: ["tableRows"], actions: [] },
  "tw-cards": {
    types: ["InviteATeammateCard"],
    views: ["InviteATeammateCardView"],
    arrays: ["inviteATeammateCards"],
    actions: ["onMessage", "onManage"],
  },
};

browserTest(
  "golden name table over the component corpus, deterministic",
  async () => {
    const all = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => m[1]!);
    const table = async () => {
      const out: typeof GOLDEN = {};
      for (const f of await corpus()) {
        const { code } = await convert({ file: `${CORPUS}/${f}` });
        const t = {
          types: all(code, /^ {4}(?:public )?struct (\w+): Identifiable/gm),
          views: all(code, /^ {4}(?:public )?struct (\w+): View/gm),
          arrays: all(code, /^ {4}(?:public )?static let (\w+):/gm),
          actions: all(code, /var (on\w+): \(\w+\) -> Void/g),
        };
        if (t.types.length) out[f.replace(/\.html$/, "")] = t;
      }
      return out;
    };
    const first = await table();
    expect(first).toEqual(GOLDEN);
    expect(await table()).toEqual(first);
  },
  300000,
);
