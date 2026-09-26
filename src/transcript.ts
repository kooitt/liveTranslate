function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Sentence-ending punctuation across the languages this app supports,
// including CJK full-width forms. Kept attached to the sentence it ends.
const SENTENCE_BOUNDARY = /(?<=[.!?。！？])\s*/;

function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(SENTENCE_BOUNDARY).filter((s) => s.trim().length > 0);
}

/**
 * Renders a fading feed of finalized sentences (newest strongest, older
 * ones progressively lighter) plus an in-progress "pending" line with a
 * blinking cursor. Splits on sentence punctuation rather than on however
 * a network message happened to chunk the text, so a long run of speech
 * reads as separate sentences instead of one continuous blob.
 */
export function renderFeed(container: HTMLElement, finalText: string, pending: string): void {
  const recent = splitIntoSentences(finalText).slice(-4);
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
