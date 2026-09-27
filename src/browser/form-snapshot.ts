import type { Page } from "playwright-core";
import type { Raw } from "./snapshot-types.ts";

/** Live form semantics keyed by whole-document element paths in the snapshot tree. */
export interface FormSnapshot {
  radioOwners: Record<string, string>;
  hiddenOptions: Record<string, boolean>;
}

/** Read actual form association and popup visibility before the snapshot drops their context. */
export async function readFormSnapshot(page: Page): Promise<FormSnapshot> {
  return page.evaluate(() => {
    const paths = new WeakMap<Element, string>();
    const scopes = new WeakMap<Node, string>();
    scopes.set(document, "tree:document");
    const childPath = (path: string, index: number) => path ? `${path}/${index}` : String(index);
    const indexDOM = (element: Element, path: string) => {
      paths.set(element, path);
      Array.from(element.children).forEach((child, index) => indexDOM(child, childPath(path, index)));
      if (element.shadowRoot) {
        const shadowPath = `${path}/#shadow`;
        scopes.set(element.shadowRoot, `tree:${shadowPath}`);
        Array.from(element.shadowRoot.children).forEach((child, index) => indexDOM(child, childPath(shadowPath, index)));
      }
    };
    indexDOM(document.documentElement, "");

    const radioOwners: Record<string, string> = {};
    const hiddenOptions: Record<string, boolean> = {};
    const walkSnapshot = (element: Element, path: string) => {
      if (element instanceof HTMLInputElement && element.type === "radio") {
        const formPath = element.form ? paths.get(element.form) : undefined;
        const owner = element.form
          ? formPath === undefined ? undefined : `form:${formPath}`
          : scopes.get(element.getRootNode());
        if (owner !== undefined) radioOwners[path] = owner;
      }
      if (element instanceof HTMLOptionElement) {
        let hidden = getComputedStyle(element).display === "none";
        for (let ancestor = element.parentElement; !hidden && ancestor && !(ancestor instanceof HTMLSelectElement); ancestor = ancestor.parentElement) {
          if (getComputedStyle(ancestor).display === "none") hidden = true;
        }
        hiddenOptions[path] = hidden;
      }
      // DOMSnapshot replaces the shadow root with its children, and keeps assigned
      // light-DOM elements beneath their slot. Pseudo-elements never count here.
      const children = element.shadowRoot ? Array.from(element.shadowRoot.children)
        : element instanceof HTMLSlotElement && element.assignedNodes().length
          ? element.assignedElements()
          : Array.from(element.children);
      children.forEach((child, index) => walkSnapshot(child, childPath(path, index)));
    };
    walkSnapshot(document.documentElement, "");
    return { radioOwners, hiddenOptions };
  });
}

/** Join live semantics before capture-root trimming or boxless descendants lose context. */
export function attachFormSnapshot(rawHtml: Raw, metadata: FormSnapshot): void {
  const walk = (node: Raw, path: string) => {
    if (node.name === "input" && node.attrs.type?.toLowerCase() === "radio" && Object.hasOwn(metadata.radioOwners, path)) {
      node.formOwner = metadata.radioOwners[path];
    }
    if (node.option && Object.hasOwn(metadata.hiddenOptions, path)) node.option.hidden = metadata.hiddenOptions[path];
    // JavaScript cannot see closed/UA roots. Their flattened snapshot children can
    // occupy the same paths as unrelated light DOM, including slotted descendants.
    // Leave the entire unresolved host subtree unproven instead of guessing a join.
    if (node.children.some(child => child.shadowRootType === "closed" || child.shadowRootType === "user-agent")) return;
    let index = 0;
    for (const child of node.children) {
      if (child.type !== 1 || child.pseudo !== undefined) continue;
      walk(child, path ? `${path}/${index++}` : String(index++));
    }
  };
  walk(rawHtml, "");
}
