export const MOSQUITO_SPECIES = [
	'Aedes aegypti',
	'Aedes albopictus',
	'Culex pipiens',
	'Culex quinquefasciatus',
	'Culex tarsalis',
] as const;

export type MosquitoSpecies = (typeof MOSQUITO_SPECIES)[number];

export interface SurveillanceSite {
	readonly id: string;
	readonly jurisdictionId: string;
	readonly latitude: number;
	readonly longitude: number;
	readonly name: string;
}

export interface TrapCollection {
	readonly collectedAt: Date;
	readonly mosquitoCount: number;
	readonly siteId: string;
	readonly species?: MosquitoSpecies;
	readonly trapNights: number;
}

export interface TrapNightRateInput {
	readonly mosquitoCount: number;
	readonly trapNights: number;
}

export function calculateTrapNightRate(input: TrapNightRateInput): number {
	if (input.trapNights <= 0) {
		return 0;
	}

	return Number((input.mosquitoCount / input.trapNights).toFixed(2));
}
