/** Hand-built LayoutDocs with viewport/anchored layers (plan 060): a trigger in a 390×844 root, closed content in `layers`. */
import { LAYOUT_DOC_VERSION, type Layer, type LayoutDoc, type LayoutNode } from "../../src/model/layout.ts";

const FONT = { "font-family": "system-ui", "font-size": "15px", "line-height": "20px", color: "rgb(17, 24, 39)" };
type Box = [number, number, number, number];

export function el(
  tag: string,
  id: string,
  [x, y, w, h]: Box,
  children: LayoutNode[] = [],
  attrs: Record<string, string> = {},
  styles: Record<string, string> = {},
  extra: Partial<LayoutNode> = {},
): LayoutNode {
  return {
    id,
    tag,
    attrs,
    styles: { ...FONT, display: "block", ...styles },
    bounds: { x, y, w, h },
    children,
    ...extra,
  };
}

export const text = (value: string, [x, y, w, h]: Box): LayoutNode => ({
  tag: "#text",
  attrs: {},
  styles: {},
  bounds: { x, y, w, h },
  text: value,
  children: [],
});

const button = (id: string, label: string, [x, y, w, h]: Box, attrs: Record<string, string> = {}) =>
  el("button", id, [x, y, w, h], [text(label, [x + 8, y + 8, w - 16, 20])], attrs);

/** A `position: fixed` box with Typed-OM insets (top, right, bottom, left). */
const fixed = (
  tag: string,
  id: string,
  box: Box,
  children: LayoutNode[],
  insets: [string, string, string, string],
  attrs: Record<string, string> = {},
  styles: Record<string, string> = {},
  paint = 2,
): LayoutNode =>
  el(
    tag,
    id,
    box,
    children,
    attrs,
    { position: "fixed", ...styles },
    {
      paint,
      preferredSize: {
        width: `${box[2]}px`,
        height: "auto",
        insets: { top: insets[0], right: insets[1], bottom: insets[2], left: insets[3] },
      },
    },
  );

/** The trigger `trigger` at (16, 8, 120, 36) (a button, an `<a href="#nextjs">`, or a plain `triggerTag`), plus `layer`. */
export function presentationDoc(layer: Partial<Layer> & Pick<Layer, "id" | "nodes">, triggerTag = "button"): LayoutDoc {
  const trigger =
    triggerTag === "button"
      ? button("trigger", "Open", [16, 8, 120, 36], { "aria-haspopup": "dialog", "aria-expanded": "false" })
      : el(
          triggerTag,
          "trigger",
          [16, 8, 120, 36],
          [text("Open", [24, 16, 60, 20])],
          triggerTag === "a" ? { href: "#nextjs" } : {},
        );
  return {
    version: LAYOUT_DOC_VERSION,
    source: "presentation.html",
    combo: { screen: "presentation", theme: "light" },
    size: { w: 390, h: 844 },
    viewport: { x: 0, y: 0, w: 390, h: 844 },
    conditions: [],
    dpr: 2,
    canvas: "white",
    fonts: [],
    root: el("main", "root", [0, 0, 390, 844], [trigger], {}, {}, { paint: 0 }),
    layers: [
      {
        trigger: "trigger",
        activation: "click",
        relation: "aria-controls",
        modal: false,
        placement: "viewport",
        dismiss: { escape: true, outside: true, buttons: [] },
        ...layer,
      },
    ],
  };
}

const SCRIM = () =>
  fixed(
    "div",
    "scrim",
    [0, 0, 390, 844],
    [],
    ["0px", "0px", "0px", "0px"],
    {},
    {
      "background-color": "rgba(0, 0, 0, 0.5)",
    },
    1,
  );

/** Radix dialog: a scrim covering the viewport and a `top/left: 50%` card translated by −50 %. */
export const DIALOG = () =>
  presentationDoc({
    id: "edit-profile",
    modal: true,
    dismiss: { escape: true, outside: true, buttons: ["cancel", "x", "gone"] },
    nodes: [
      SCRIM(),
      fixed(
        "div",
        "card",
        [195, 422, 300, 200],
        [
          button("cancel", "Cancel", [211, 560, 100, 36]),
          button("save", "Save changes", [321, 560, 120, 36]),
          button("x", "Close", [459, 430, 30, 30]),
        ],
        ["50%", "auto", "auto", "50%"],
        { role: "dialog", "aria-modal": "true" },
        { "background-color": "white", translate: "-50% -50%" },
      ),
    ],
  });

/** A right sheet: inset-y-0 right-0, left auto. */
export const SHEET = () =>
  presentationDoc({
    id: "open-sheet",
    modal: true,
    nodes: [
      SCRIM(),
      fixed(
        "div",
        "sheet",
        [97.5, 0, 292.5, 844],
        [text("Edit", [113, 16, 40, 20])],
        ["0px", "0px", "0px", "auto"],
        {
          role: "dialog",
        },
        { "background-color": "white" },
      ),
    ],
  });

/** A popper: a fixed 0,0 wrapper translated 4 px under the trigger. */
export const POPOVER = (activation: Layer["activation"] = "click", side?: string) =>
  presentationDoc(
    {
      id: activation === "hover" ? "nextjs" : "open-popover",
      activation,
      placement: "anchored",
      nodes: [
        fixed(
          "div",
          "popper",
          [0, 0, 288, 120],
          [
            el(
              "div",
              "pop",
              [0, 0, 288, 120],
              [text("Dimensions", [16, 16, 80, 20])],
              side ? { "data-side": side } : {},
            ),
          ],
          ["0px", "auto", "auto", "0px"],
          {},
          { transform: "matrix(1, 0, 0, 1, 16, 48)" },
        ),
      ],
    },
    activation === "hover" ? "a" : "button",
  );

/** `role=alertdialog` content: outside taps never dismiss it. */
export const ALERT = () =>
  presentationDoc({
    id: "delete-account",
    modal: true,
    dismiss: { escape: true, outside: true, buttons: ["cancel"] },
    nodes: [
      SCRIM(),
      fixed(
        "div",
        "alert",
        [195, 422, 300, 160],
        [button("cancel", "Cancel", [211, 530, 100, 36])],
        ["50%", "auto", "auto", "50%"],
        { role: "alertdialog" },
        { translate: "-50% -50%" },
      ),
    ],
  });

/** A native modal `<dialog>`: top layer, auto margins, a `::backdrop` colour. */
export const NATIVE = () =>
  presentationDoc({
    id: "open-dialog",
    relation: "commandfor",
    modal: true,
    nodes: [
      el(
        "dialog",
        "d",
        [45, 372, 300, 100],
        [text("Native", [61, 388, 60, 20])],
        { open: "" },
        { position: "fixed", overlay: "auto", "background-color": "white" },
        {
          paint: 2,
          preferredSize: {
            width: "300px",
            height: "auto",
            insets: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
            autoMargins: ["top", "right", "bottom", "left"],
          },
          pseudoStyles: { backdrop: { "background-color": "rgba(0, 0, 0, 0.1)" } },
        },
      ),
    ],
  });

/** A menu layer (061) and a tooltip layer (062): both left alone. */
export const MENU = () =>
  presentationDoc({
    id: "menu",
    placement: "anchored",
    nodes: [fixed("div", "m", [16, 48, 120, 80], [], ["0px", "auto", "auto", "0px"], { role: "menu" })],
  });
export const TOOLTIP = () =>
  presentationDoc({
    id: "tip",
    activation: "hover",
    placement: "anchored",
    nodes: [fixed("div", "t", [16, 48, 120, 30], [], ["0px", "auto", "auto", "0px"], { role: "tooltip" })],
  });

/** A menu item row: `role` and `label` (plus `extra` children: an icon, a shortcut) at row `i` of a menu at y 48. */
const row = (
  id: string,
  role: string,
  label: string,
  i: number,
  attrs: Record<string, string> = {},
  extra: LayoutNode[] = [],
) => el("div", id, [20, 52 + i * 28, 216, 28], [text(label, [28, 56 + i * 28, 80, 20]), ...extra], { role, ...attrs });
const popper = (id: string, content: LayoutNode) =>
  fixed(
    "div",
    `${id}-popper`,
    [0, 0, 224, 300],
    [content],
    ["0px", "auto", "auto", "0px"],
    {},
    {
      transform: "matrix(1, 0, 0, 1, 16, 48)",
    },
  );

/** shadcn dropdown (plan 061's fixture table, first row). */
export const DROPDOWN = () =>
  presentationDoc({
    id: "open",
    placement: "anchored",
    nodes: [
      popper(
        "dd",
        el(
          "div",
          "dd",
          [16, 48, 224, 300],
          [
            el("div", "dd-label", [20, 52, 216, 28], [text("My Account", [28, 56, 80, 20])], {
              "data-slot": "dropdown-menu-label",
            }),
            el(
              "div",
              "dd-group",
              [20, 80, 216, 84],
              [
                row("profile", "menuitem", "Profile", 1, {}, [
                  el("svg", "profile-icon", [28, 60, 16, 16]),
                  el("span", "profile-shortcut", [200, 60, 30, 16], [text("⇧⌘P", [200, 60, 30, 16])], {
                    "data-slot": "dropdown-menu-shortcut",
                  }),
                ]),
                row("billing", "menuitem", "Billing", 2),
                row("settings", "menuitem", "Settings", 3),
              ],
              { role: "group" },
            ),
            el("div", "sep1", [16, 164, 224, 1], [], { role: "separator" }),
            row("status", "menuitemcheckbox", "Status Bar", 5, { "aria-checked": "true" }),
            el(
              "div",
              "position",
              [20, 200, 216, 56],
              [
                row("top", "menuitemradio", "Top", 6, { "aria-checked": "true" }),
                row("bottom", "menuitemradio", "Bottom", 7, { "aria-checked": "false" }),
              ],
              { role: "group" },
            ),
            el("div", "sep2", [16, 260, 224, 1], [], { role: "separator" }),
            row("logout", "menuitem", "Log out", 9, { "data-variant": "destructive" }),
            row("invite", "menuitem", "Invite users", 10, { "aria-haspopup": "menu" }),
          ],
          { role: "menu", "data-slot": "dropdown-menu-content" },
        ),
      ),
    ],
  });

/** shadcn context menu: a right-click `span` area. */
export const CONTEXT = () =>
  presentationDoc(
    {
      id: "right-click-here",
      activation: "contextmenu",
      placement: "anchored",
      nodes: [
        popper(
          "cm",
          el(
            "div",
            "cm",
            [16, 48, 224, 120],
            [
              row("back", "menuitem", "Back", 0),
              row("forward", "menuitem", "Forward", 1, { "aria-disabled": "true", "data-disabled": "" }),
              el("div", "cm-sep", [16, 104, 224, 1], [], { role: "separator" }),
              row("bookmarks", "menuitemcheckbox", "Show Bookmarks", 3, { "aria-checked": "false" }),
            ],
            { role: "menu" },
          ),
        ),
      ],
    },
    "span",
  );

/** Radix select: a `role=combobox` trigger showing its `select-value`, a listbox of two labelled groups. */
export const SELECT = (value = true) => {
  const option = (id: string, label: string, i: number, attrs: Record<string, string> = {}) =>
    row(id, "option", label, i, attrs);
  const group = (id: string, label: string, i: number, options: LayoutNode[]) =>
    el(
      "div",
      id,
      [20, 52 + i * 28, 216, 84],
      [
        el("div", `${id}-label`, [20, 52 + i * 28, 216, 28], [text(label, [28, 56 + i * 28, 80, 20])], {
          id: `${id}-label`,
          "data-slot": "select-label",
        }),
        ...options,
      ],
      { role: "group", "aria-labelledby": `${id}-label` },
    );
  const d = presentationDoc({
    id: "select-a-fruit",
    placement: "anchored",
    nodes: [
      popper(
        "sl",
        el(
          "div",
          "sl",
          [16, 48, 224, 200],
          [
            group("fruits", "Fruits", 0, [
              option("apple", "Apple", 1),
              option("banana", "Banana", 2, { "aria-selected": "true" }),
            ]),
            group("more", "More", 3, [
              option("grapes", "Grapes", 4),
              option("kiwi", "Kiwi", 5, { "aria-disabled": "true", "data-disabled": "" }),
            ]),
          ],
          { role: "listbox" },
        ),
      ),
    ],
  });
  d.root.children = [
    el(
      "button",
      "trigger",
      [16, 8, 180, 36],
      [
        el(
          "span",
          "value",
          [28, 16, 100, 20],
          [text("Banana", [28, 16, 60, 20])],
          value ? { "data-slot": "select-value" } : {},
        ),
        el("svg", "chevron", [168, 18, 16, 16]),
      ],
      { role: "combobox", "aria-expanded": "false" },
      { display: "flex" },
    ),
  ];
  return d;
};
