export {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type JsonObject,
	type LocalDateString,
} from '../shared.js';
export * from './collection-species.js';
export * from './collections.js';
export type {
	AdultSurveillanceCommandType,
	CollectedCollectionTiming,
	CollectionTiming,
	CollectionTimingMode,
	DateDurationCollectionTiming,
	DomainCommand,
	ExactCollectedCollectionTiming,
	ExactPendingCollectionTiming,
} from './shared.js';
export { COLLECTION_DURATION_UNIT_TYPES, isCollectionDurationUnitType } from './shared.js';
export * from './traps.js';

import type {
	AddCollectionSpeciesCountCommand,
	DeleteCollectionSpeciesCountCommand,
	UpdateCollectionSpeciesCountCommand,
} from './collection-species.js';
import type {
	CancelPendingCollectionCommand,
	ClearCollectionZeroResultCommand,
	CollectCollectionCommand,
	DeleteCollectionCommand,
	MarkCollectionZeroResultCommand,
	RecordCollectedAdHocCollectionCommand,
	RecordCollectedTrapCollectionCommand,
	SetAdHocCollectionCommand,
	SetCollectionBycatchCommand,
	SetTrapCollectionCommand,
	UpdateAdHocCollectionConfigurationCommand,
	UpdateCollectionFieldDetailsCommand,
} from './collections.js';
import type {
	CreateTrapCommand,
	DeleteTrapCommand,
	ReactivateTrapCommand,
	RetireTrapCommand,
	UpdateTrapConfigurationCommand,
	UpdateTrapDetailsCommand,
} from './traps.js';

export type AdultSurveillanceCommand =
	| CreateTrapCommand
	| UpdateTrapDetailsCommand
	| UpdateTrapConfigurationCommand
	| RetireTrapCommand
	| ReactivateTrapCommand
	| DeleteTrapCommand
	| SetTrapCollectionCommand
	| SetAdHocCollectionCommand
	| RecordCollectedTrapCollectionCommand
	| RecordCollectedAdHocCollectionCommand
	| CollectCollectionCommand
	| CancelPendingCollectionCommand
	| UpdateCollectionFieldDetailsCommand
	| UpdateAdHocCollectionConfigurationCommand
	| DeleteCollectionCommand
	| AddCollectionSpeciesCountCommand
	| UpdateCollectionSpeciesCountCommand
	| DeleteCollectionSpeciesCountCommand
	| MarkCollectionZeroResultCommand
	| ClearCollectionZeroResultCommand
	| SetCollectionBycatchCommand;
