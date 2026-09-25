export function mappingText(mapping) {
  const total = Number(mapping.total) || 0;
  const mapped = Number(mapping.mapped) || 0;
  if (total === 0) return "No emitted nodes";
  return `${mapped}/${total} mapped · ${((mapped / total) * 100).toFixed(1)}% nodes`;
}

function heading(text) {
  const element = document.createElement("h3");
  element.textContent = text;
  return element;
}

function paragraph(text) {
  const element = document.createElement("p");
  element.textContent = text;
  return element;
}

function reportList(items, diagnostics) {
  const list = document.createElement("ul");
  for (const item of items) {
    const row = document.createElement("li");
    if (!diagnostics) {
      row.textContent = item;
    } else {
      const id = document.createElement("span");
      id.className = "report-id";
      id.textContent = item.id || "Element";
      row.append(id);
      if (item.confidence) {
        const confidence = document.createElement("span");
        confidence.className = "report-confidence";
        confidence.textContent = item.confidence;
        row.append(confidence);
      }
      if (Array.isArray(item.notes) && item.notes.length) {
        const notes = document.createElement("ul");
        for (const note of item.notes) {
          const line = document.createElement("li");
          line.textContent = note;
          notes.append(line);
        }
        row.append(notes);
      }
    }
    list.append(row);
  }
  return list;
}

/** All strings from converter diagnostics remain text, never inserted as HTML. */
export function renderReport(container, result) {
  container.replaceChildren(heading("Emitted node mapping"));
  container.append(paragraph("Counts generated semantic nodes by mapping confidence. It does not measure visual similarity, behavior, or total DOM coverage."));
  const breakdown = document.createElement("div");
  breakdown.className = "mapping-breakdown";
  for (const [label, count] of [["Mapped", result.mapping.mapped], ["Approximated", result.mapping.approximated], ["Unmapped", result.mapping.unmapped], ["Total", result.mapping.total]]) {
    const item = document.createElement("span");
    const number = document.createElement("strong");
    number.textContent = String(count ?? 0);
    item.append(number, ` ${label.toLowerCase()}`);
    breakdown.append(item);
  }
  container.append(breakdown);

  const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  container.append(heading(`Conversion notes (${diagnostics.length})`));
  container.append(diagnostics.length ? reportList(diagnostics, true) : paragraph("No conversion notes for this capture. Native visual accuracy still needs verification."));
  container.append(heading(`Browser and asset warnings (${warnings.length})`));
  container.append(warnings.length ? reportList(warnings, false) : paragraph("No browser or asset warnings."));
  if (result.assets && Object.keys(result.assets).length) {
    container.append(paragraph(`${Object.keys(result.assets).length} bundled asset file(s) are included in the ZIP download.`));
  }
  return diagnostics.length + warnings.length;
}
