export interface RgbColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

export function parseCssColor(value: string): RgbColor | null {
	const oklch = value.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?/i);
	if (oklch !== null) {
		const lightness = Number(oklch[1]) > 1 ? Number(oklch[1]) / 100 : Number(oklch[1]);
		return oklchToRgb(lightness, Number(oklch[2]), Number(oklch[3]));
	}

	const hex = value.match(/^#?([\da-f]{6})$/i);
	if (hex !== null) {
		const raw = hex[1] ?? '';
		return {
			r: Number.parseInt(raw.slice(0, 2), 16),
			g: Number.parseInt(raw.slice(2, 4), 16),
			b: Number.parseInt(raw.slice(4, 6), 16),
		};
	}

	return null;
}

export function formatHex({ r, g, b }: RgbColor) {
	return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function formatRgb({ r, g, b }: RgbColor) {
	return `rgb(${r} ${g} ${b})`;
}

export function contrastRatio(a: RgbColor, b: RgbColor) {
	const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
	const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
	return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ r, g, b }: RgbColor) {
	const rs = toLinearChannel(r);
	const gs = toLinearChannel(g);
	const bs = toLinearChannel(b);

	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function toLinearChannel(channel: number) {
	const value = channel / 255;
	return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function oklchToRgb(lightness: number, chroma: number, hue: number): RgbColor {
	const hueRadians = (hue * Math.PI) / 180;
	const a = Math.cos(hueRadians) * chroma;
	const b = Math.sin(hueRadians) * chroma;

	const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ ** 3;
	const m = m_ ** 3;
	const s = s_ ** 3;

	const linear = {
		r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	};

	return {
		r: toSrgb(linear.r),
		g: toSrgb(linear.g),
		b: toSrgb(linear.b),
	};
}

function toSrgb(value: number) {
	const channel = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
	return Math.round(Math.min(1, Math.max(0, channel)) * 255);
}
