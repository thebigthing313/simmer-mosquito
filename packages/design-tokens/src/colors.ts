export const green = {
	50: '#eef8f1',
	100: '#d7efe0',
	200: '#b2debf',
	300: '#85c79d',
	400: '#55aa7a',
	500: '#318e62',
	600: '#1b7e53',
	700: '#0c5331',
	800: '#053d22',
	900: '#042b19',
} as const;

export const yellow = {
	50: '#fbfbe9',
	100: '#f5f6ce',
	200: '#ebeaa0',
	300: '#ddda69',
	400: '#cbc83c',
	500: '#aaa421',
	600: '#868018',
	700: '#625d17',
	800: '#444014',
	900: '#2b2810',
} as const;

export const brand = {
	green: green[600],
	darkGreen: green[700],
	darkerGreen: green[800],
	yellow: yellow[100],
	purple: '#893f8c',
	red: '#ef2352',
	blue: '#2d46b6',
} as const;

export type BrandColor = keyof typeof brand;
export type BrandScale = keyof typeof green;
