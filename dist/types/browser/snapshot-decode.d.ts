import type { DomSnapshot, Raw } from "./snapshot-types.ts";
/**
 * @param snap     snapshot as painted (styles incl. transform matrices, paint order)
 * @param boxes    optional snapshot taken with `transform: none` on every element;
 *                 its bounds/offsets are the untransformed layout boxes and win over `snap`'s.
 */
export declare function snapshotToTree(snap: DomSnapshot, boxes?: DomSnapshot): Raw;
