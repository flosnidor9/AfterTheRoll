type Rgba = [number, number, number, number];
type Rgb = [number, number, number];

const MIN_TEXT_CONTRAST = 4.5;
const LIGHT_INK: Rgb = [241, 237, 232];
const DARK_INK: Rgb = [40, 37, 42];
const CANVAS: Rgb = [255, 255, 255];
const SRGB_LINEAR_THRESHOLD = 0.04045;

function parseComputedColor(value: string): Rgba | null {
  // Computed sRGB colors are serialized as rgb()/rgba(), including legacy hex/names.
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) return null;
  const channels = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  if (channels.some((channel) => !Number.isFinite(channel))) return null;
  return [channels[0], channels[1], channels[2], channels[3] ?? 1];
}

function composite(foreground: Rgba, background: Rgb): Rgb {
  return background.map((channel, index) => foreground[index] * foreground[3] + channel * (1 - foreground[3])) as Rgb;
}

function luminance(color: Rgb): number {
  const linear = color.map((channel) => {
    const srgb = channel / 255;
    return srgb <= SRGB_LINEAR_THRESHOLD ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function logTextContrast(foreground: Rgb, background: Rgb): number {
  const values = [luminance(foreground), luminance(background)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

/** Keep readable archive colors; repair only text that blends into its actual surface. */
export function ensureReadableLogColors(root: HTMLElement): void {
  const backgrounds = new Map<Element, Rgb>();
  const backgroundFor = (element: Element | null): Rgb => {
    if (!element) return CANVAS;
    const cached = backgrounds.get(element);
    if (cached) return cached;
    const own = parseComputedColor(getComputedStyle(element).backgroundColor);
    const background = own?.[3] === 1 ? own.slice(0, 3) as Rgb
      : composite(own ?? [0, 0, 0, 0], backgroundFor(element.parentElement));
    backgrounds.set(element, background);
    return background;
  };

  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    if (!Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) continue;
    const foreground = parseComputedColor(getComputedStyle(element).color);
    if (!foreground) continue;
    const background = backgroundFor(element);
    if (logTextContrast(composite(foreground, background), background) >= MIN_TEXT_CONTRAST) continue;
    const ink = logTextContrast(LIGHT_INK, background) > logTextContrast(DARK_INK, background) ? LIGHT_INK : DARK_INK;
    element.style.setProperty('color', `rgb(${ink.join(', ')})`, 'important');
  }
}
