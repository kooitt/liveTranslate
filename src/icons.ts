// Small hand-written icon set (one consistent style, stroke-based, 20x20)
// so the app doesn't need an icon-library dependency.
function svg(paths: string): string {
  return `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const icons = {
  mic: svg(
    '<rect x="7" y="2.5" width="6" height="10" rx="3"/><path d="M4 9.5a6 6 0 0 0 12 0"/><path d="M10 15.5v2.5M7 18h6"/>',
  ),
  volume: svg(
    '<path d="M3 8v4h3l4 3.5v-11L6 8H3z"/><path d="M13.5 7.2a4 4 0 0 1 0 5.6"/>',
  ),
  mute: svg(
    '<path d="M3 8v4h3l4 3.5v-11L6 8H3z"/><path d="M13 8l4 4M17 8l-4 4"/>',
  ),
  link: svg(
    '<path d="M8.5 11.5 11.5 8.5"/><path d="M9 6l1.3-1.3a3 3 0 0 1 4.2 4.2L13 10"/><path d="M11 14l-1.3 1.3a3 3 0 0 1-4.2-4.2L7 9.8"/>',
  ),
  settings: svg(
    '<circle cx="10" cy="10" r="2.6"/><path d="M10 3.5v2M10 14.5v2M4.4 6.2l1.7 1M13.9 12.8l1.7 1M4.4 13.8l1.7-1M13.9 7.2l1.7-1"/>',
  ),
  sun: svg(
    '<circle cx="10" cy="10" r="3.2"/><path d="M10 3v1.6M10 15.4V17M4.2 4.2l1.2 1.2M14.6 14.6l1.2 1.2M3 10h1.6M15.4 10H17M4.2 15.8l1.2-1.2M14.6 5.4l1.2-1.2"/>',
  ),
  moon: svg('<path d="M15.5 11.8A6 6 0 0 1 8.2 4.5a6.2 6.2 0 1 0 7.3 7.3z"/>'),
  chevronDown: svg('<path d="M5.5 8l4.5 4.5L14.5 8"/>'),
  play: svg('<path d="M6 4.5v11l9-5.5-9-5.5z"/>'),
  pause: svg('<rect x="5.5" y="4.5" width="3" height="11"/><rect x="11.5" y="4.5" width="3" height="11"/>'),
  stop: svg('<rect x="5" y="5" width="10" height="10" rx="1.5"/>'),
  close: svg('<path d="M5 5l10 10M15 5L5 15"/>'),
  expand: svg(
    '<path d="M7 3H3v4"/><path d="M13 3h4v4"/><path d="M17 13v4h-4"/><path d="M3 13v4h4"/>',
  ),
};
