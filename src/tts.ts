// Free, native browser text-to-speech only. No paid TTS API is ever called.
// Off by default; caller must opt in via setSpeechEnabled(true).
let enabled = false;
let volume = 1;

// The Web Speech API has no gender field on a voice — only a free-text
// name, and voice lists load asynchronously. Cache them and pick a voice
// that looks male: either explicitly labeled ("Google UK English Male")
// or a known male name from a built-in voice engine (Windows SAPI/Neural,
// macOS/iOS, Chrome network voices all just use personal names, no tag).
// ponytail: name-list heuristic with no real ceiling — an unlisted or
// unusual voice name just falls back to that language's default voice.
const KNOWN_MALE_NAME = new RegExp(
  "\\b(male|david|mark|guy|ryan|christopher|james|eric|andrew|brian|roger|" +
    "alex|fred|daniel|oliver|aaron|arthur|george|liam|matthew|justin|conrad|" +
    "diego|carlos|pablo|raul|miguel|jorge|hans|stefan|felix|pierre|henri|paul|" +
    "nicolas|cosimo|takeshi|kenji|hiroshi|ichiro|ivan|sergei|dmitri|pavel|" +
    "luca|marco|giovanni|raj|arjun|hemant|madhur|naayf|kangkang)\\b",
  "i",
);

let voices: SpeechSynthesisVoice[] = [];
function loadVoices(): void {
  voices = speechSynthesis.getVoices();
}
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function pickMaleVoice(bcp47Lang: string): SpeechSynthesisVoice | undefined {
  const langPrefix = bcp47Lang.toLowerCase().split("-")[0];
  const forLang = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const pool = forLang.length ? forLang : voices;
  return pool.find((v) => KNOWN_MALE_NAME.test(v.name) && !/female/i.test(v.name)) ?? pool[0];
}

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
  const voice = pickMaleVoice(bcp47Lang);
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
