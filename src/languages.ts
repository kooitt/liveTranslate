export interface LanguageOption {
  code: string; // Soniox language code
  name: string;
  flag: string;
  bcp47: string; // for SpeechSynthesisUtterance.lang
}

// Curated list (not the full 60+ Soniox languages): each active language in a
// room costs one concurrent Soniox real-time stream, so keep this short.
export const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", flag: "🇬🇧", bcp47: "en-US" },
  { code: "es", name: "Spanish", flag: "🇪🇸", bcp47: "es-ES" },
  { code: "fr", name: "French", flag: "🇫🇷", bcp47: "fr-FR" },
  { code: "de", name: "German", flag: "🇩🇪", bcp47: "de-DE" },
  { code: "it", name: "Italian", flag: "🇮🇹", bcp47: "it-IT" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹", bcp47: "pt-PT" },
  { code: "zh", name: "Chinese", flag: "🇨🇳", bcp47: "zh-CN" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", bcp47: "ja-JP" },
  { code: "ko", name: "Korean", flag: "🇰🇷", bcp47: "ko-KR" },
  { code: "ar", name: "Arabic", flag: "🇸🇦", bcp47: "ar-SA" },
  { code: "hi", name: "Hindi", flag: "🇮🇳", bcp47: "hi-IN" },
  { code: "ru", name: "Russian", flag: "🇷🇺", bcp47: "ru-RU" },
];
