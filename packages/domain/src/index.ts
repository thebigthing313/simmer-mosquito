export * from './adult-surveillance.js';
export * from './control-operations.js';
export * from './field-work.js';
export * from './foundation.js';
export * from './larval-surveillance.js';
export * from './mission-dispatch.js';
export * from './organization-settings.js';
export * from './shared.js';

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
