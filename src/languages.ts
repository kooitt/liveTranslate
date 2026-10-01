export interface LanguageOption {
  code: string; // Soniox language code
  name: string; // native display name (primary identifier — not a flag)
  englishName: string;
  bcp47: string; // for SpeechSynthesisUtterance.lang
}

// Curated list (not the full 60+ Soniox languages): each active language in a
// room costs one concurrent Soniox real-time stream, so keep this short.
export const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", englishName: "English", bcp47: "en-US" },
  { code: "zh", name: "中文（简体）", englishName: "Chinese", bcp47: "zh-CN" },
  { code: "es", name: "Español", englishName: "Spanish", bcp47: "es-ES" },
  { code: "fr", name: "Français", englishName: "French", bcp47: "fr-FR" },
  { code: "de", name: "Deutsch", englishName: "German", bcp47: "de-DE" },
  { code: "it", name: "Italiano", englishName: "Italian", bcp47: "it-IT" },
  { code: "pt", name: "Português", englishName: "Portuguese", bcp47: "pt-PT" },
  { code: "ja", name: "日本語", englishName: "Japanese", bcp47: "ja-JP" },
  { code: "ko", name: "한국어", englishName: "Korean", bcp47: "ko-KR" },
  { code: "ms", name: "Bahasa Melayu", englishName: "Malay", bcp47: "ms-MY" },
  { code: "ar", name: "العربية", englishName: "Arabic", bcp47: "ar-SA" },
  { code: "hi", name: "हिन्दी", englishName: "Hindi", bcp47: "hi-IN" },
  { code: "ru", name: "Русский", englishName: "Russian", bcp47: "ru-RU" },
  { code: "ta", name: "தமிழ்", englishName: "Tamil", bcp47: "ta-IN" },
];

export function findLanguage(code: string): LanguageOption | undefined {
  return LANGUAGES.find((l) => l.code === code);
}
