import type { LayoutNode } from "../model/layout.ts";
import type { ControlNode } from "../model/semantic.ts";

interface DateInputState {
  dateKind?: ControlNode["dateKind"];
  dateComponents?: ControlNode["dateComponents"];
  value?: string;
  readOnly?: boolean;
  notes: string[];
}

/** Keep date-family capture and native limitations separate from control dispatch. */
export function applyDateInput(node: LayoutNode, kind: NonNullable<ControlNode["dateKind"]>, spec: DateInputState): void {
  spec.dateKind = kind;
  spec.notes.push(`approximated: <input type="${kind}"> browser control appearance and locale formatting are not preserved`);
  if (kind === "month" || kind === "week") {
    spec.notes.push(`approximated: <input type="${kind}"> ${kind}-only selection has no equivalent SwiftUI DatePicker → static captured value; editing requires a custom selector`);
    return;
  }
  spec.dateComponents = dateComponents(spec.value ?? "", kind);
  if (!spec.readOnly && !spec.dateComponents) {
    spec.notes.push(`approximated: <input type="${kind}"> ${spec.value ? "invalid captured value" : "empty selection"} → native picker starts at the current local date/time`);
  }
  if (!spec.readOnly && kind !== "date" && ((spec.dateComponents?.second ?? 0) !== 0 || (spec.dateComponents?.nanosecond ?? 0) !== 0 ||
    (node.attrs.step !== undefined && Number(node.attrs.step) > 0 && Number(node.attrs.step) < 60))) {
    spec.notes.push("approximated: captured seconds/fractions remain in the initial value; native date/time picker exposes hour and minute selection only");
  }
  if (!spec.readOnly && ["min", "max", "step"].some(attribute => node.attrs[attribute] !== undefined)) {
    spec.notes.push(`approximated: <input type="${kind}"> min/max/step validation constraints are not translated`);
  }
}

/** Parse HTML's normalized values without a host timezone or JavaScript Date conversion. */
function dateComponents(value: string, kind: "date" | "time" | "datetime-local"): ControlNode["dateComponents"] {
  if (kind === "time") return timeComponents(value);
  const [date, time, ...extra] = kind === "datetime-local" ? value.split(/[T ]/) : [value];
  if (extra.length) return undefined;
  const parts = /^(\d{4,})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!parts) return undefined;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isSafeInteger(year) || year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]!) return undefined;
  if (kind === "date") return { year, month, day };
  const clock = timeComponents(time ?? "");
  return clock ? { year, month, day, ...clock } : undefined;
}

function timeComponents(value: string): ControlNode["dateComponents"] {
  const parts = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!parts) return undefined;
  const hour = Number(parts[1]), minute = Number(parts[2]), second = Number(parts[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  const nanosecond = Number((parts[4] ?? "").padEnd(3, "0")) * 1_000_000;
  return { hour, minute, second, nanosecond };
}
