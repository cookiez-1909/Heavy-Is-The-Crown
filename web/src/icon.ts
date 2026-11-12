/** A coin icon made of one emoji on a colored disc: fits in a few hundred bytes on-chain. */
export function makeIcon(emoji: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="${color}"/><text x="48" y="50" font-size="52" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export const EMOJI = ["🐸", "🐶", "🐱", "🦍", "🐧", "🦊", "🐹", "🦖", "👽", "🤡", "💀", "🍌", "🚀", "🧠", "🗿", "🍕"];
export const COLORS = ["#2f9e62", "#d9a520", "#c2452f", "#7a4fd6", "#1f7ae0", "#d6418c", "#3b3f4a", "#e8e2d0"];
