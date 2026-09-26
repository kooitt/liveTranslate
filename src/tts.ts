// Free, native browser text-to-speech only. No paid TTS API is ever called.
// Off by default; caller must opt in via setSpeechEnabled(true).
let enabled = false;
let volume = 1;

export function isSpeechEnabled(): boolean {
  return enabled;
}

export function setSpeechEnabled(value: boolean): void {
  enabled = value;
  if (!value) speechSynthesis.cancel();
}

export function getSpeechVolume(): number {
  return volume;
}

export function setSpeechVolume(value: number): void {
  volume = Math.max(0, Math.min(1, value));
}

export function speak(text: string, bcp47Lang: string): void {
  if (!enabled || volume <= 0 || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = bcp47Lang;
  utterance.volume = volume;
  speechSynthesis.speak(utterance);
}
