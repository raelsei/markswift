export function mappingText(mapping) {
  const total = Number(mapping.total) || 0;
  const mapped = Number(mapping.mapped) || 0;
  if (total === 0) return "No emitted nodes";
  return `${mapped}/${total} mapped · ${((mapped / total) * 100).toFixed(1)}% nodes`;
}

export function mappingSummary(result) {
  if (!result.branches) return mappingText(result.mapping);
  return result.branches.map(branch => `${branch.branch === "compact" ? "Compact" : "Regular"} ${branch.mapping.mapped}/${branch.mapping.total}`).join(" · ") + " mapped";
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

function renderMapping(container, mapping) {
  const breakdown = document.createElement("div");
  breakdown.className = "mapping-breakdown";
  for (const [label, count] of [["Mapped", mapping.mapped], ["Approximated", mapping.approximated], ["Unmapped", mapping.unmapped], ["Total", mapping.total]]) {
    const item = document.createElement("span");
    const number = document.createElement("strong");
    number.textContent = String(count ?? 0);
    item.append(number, ` ${label.toLowerCase()}`);
    breakdown.append(item);
  }
  container.append(breakdown);
}

function renderNotes(container, diagnostics) {
  container.append(heading(`Conversion notes (${diagnostics.length})`));
  container.append(diagnostics.length ? reportList(diagnostics, true) : paragraph("No conversion notes for this capture. Native visual accuracy still needs verification."));
}

function renderWarnings(container, warnings, title) {
  container.append(heading(`${title} (${warnings.length})`));
  container.append(warnings.length ? reportList(warnings, false) : paragraph("No browser or asset warnings."));
}

/** All strings from converter diagnostics remain text, never inserted as HTML. */
export function renderReport(container, result) {
  container.replaceChildren(heading("Emitted node mapping"));
  container.append(paragraph("Counts generated semantic nodes by mapping confidence. It does not measure visual similarity, behavior, or total DOM coverage."));
  let noteCount = 0;
  if (result.branches) {
    container.append(paragraph(`Swift selects the compact layout at width ≤ ${result.breakpoint} points and the regular layout above it. These are two sampled CSS states; intermediate widths and other media conditions are not reconstructed.`));
    for (const branch of result.branches) {
      const label = branch.branch === "compact" ? "Compact" : "Regular";
      container.append(heading(`${label} · ${branch.width} × ${branch.height} px · ${mappingText(branch.mapping)}`));
      renderMapping(container, branch.mapping);
      renderNotes(container, branch.diagnostics);
      renderWarnings(container, branch.warnings, `${label} capture warnings`);
      noteCount += branch.diagnostics.length + branch.warnings.length;
    }
  } else {
    renderMapping(container, result.mapping);
    renderNotes(container, result.diagnostics);
    noteCount += result.diagnostics.length;
  }
  renderWarnings(container, result.warnings, result.branches ? "Combined browser and asset warnings" : "Browser and asset warnings");
  noteCount += result.warnings.length;
  if (result.assets && Object.keys(result.assets).length) {
    container.append(paragraph(`${Object.keys(result.assets).length} bundled asset file(s) are included in the ZIP download.`));
  }
  return noteCount;
}
