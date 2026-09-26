// Free, native browser text-to-speech only. No paid TTS API is ever called.
// Off by default; caller must opt in via setSpeechEnabled(true).
let enabled = false;

export function isSpeechEnabled(): boolean {
  return enabled;
}

export function setSpeechEnabled(value: boolean): void {
  enabled = value;
  if (!value) speechSynthesis.cancel();
}

export function speak(text: string, bcp47Lang: string): void {
  if (!enabled || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = bcp47Lang;
  speechSynthesis.speak(utterance);
}
