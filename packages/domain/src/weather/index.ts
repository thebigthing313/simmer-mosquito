export * from './import.js';
export * from './shared.js';
export * from './stations.js';
export * from './summaries.js';

import type { CommitWeatherSummaryImportCommand } from './import.js';
import type {
	CreateWeatherStationCommand,
	DeactivateWeatherStationCommand,
	DeleteWeatherStationCommand,
	ReactivateWeatherStationCommand,
	UpdateWeatherStationDetailsCommand,
	UpdateWeatherStationLocationCommand,
} from './stations.js';
import type {
	CreateWeatherSummaryCommand,
	DeleteWeatherSummaryCommand,
	UpdateWeatherSummaryCommand,
} from './summaries.js';

export type WeatherCommand =
	| CreateWeatherStationCommand
	| UpdateWeatherStationDetailsCommand
	| UpdateWeatherStationLocationCommand
	| DeactivateWeatherStationCommand
	| ReactivateWeatherStationCommand
	| DeleteWeatherStationCommand
	| CreateWeatherSummaryCommand
	| UpdateWeatherSummaryCommand
	| DeleteWeatherSummaryCommand
	| CommitWeatherSummaryImportCommand;
