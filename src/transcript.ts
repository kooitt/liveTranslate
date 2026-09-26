function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Renders a fading feed of finalized lines (newest strongest, older lines
 * progressively lighter) plus an in-progress "pending" line with a blinking
 * cursor. Not a chat log — plain stacked text, most recent 4 lines shown.
 */
export function renderFeed(container: HTMLElement, finalLines: string[], pending: string): void {
  const recent = finalLines.slice(-4);
  const parts = recent.map((line, i) => {
    const age = recent.length - 1 - i; // 0 = newest
    return `<div class="transcript-line line-age-${Math.min(age, 3)}">${escapeHtml(line)}</div>`;
  });
  if (pending.trim()) {
    parts.push(
      `<div class="transcript-line line-pending">${escapeHtml(pending)}<span class="line-cursor">▍</span></div>`,
    );
  }
  container.innerHTML = parts.join("");
  container.scrollTop = container.scrollHeight;
}
