export const brand = {
	green: '#1b7e53',
	darkGreen: '#0c5331',
	darkerGreen: '#053d22',
	yellow: '#f5f6ce',
	purple: '#893f8c',
	red: '#ef2352',
	blue: '#2d46b6',
} as const;

export type BrandColor = keyof typeof brand;
