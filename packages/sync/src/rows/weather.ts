import type { AuditedOrganizationRowBase, WeatherSourceType } from './operations.js';

export interface WeatherSourceRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string | null;
	readonly sourceType: WeatherSourceType;
	readonly sourceName: string;
	readonly sourceCode: string | null;
	readonly providerSourceId: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WeatherSourceSubscriptionRow extends AuditedOrganizationRowBase {
	readonly weatherSourceId: string;
	readonly isActive: boolean;
}

export interface WeatherSummaryRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string | null;
	readonly weatherSourceId: string;
	readonly startDate: string;
	readonly endDate: string;
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}
