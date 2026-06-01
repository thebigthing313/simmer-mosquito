export * from './habitats.js';
export * from './inspections.js';
export * from './sample-species.js';
export * from './samples.js';
export type {
	ImmatureStageFlag,
	LarvalDomainCommand,
	LarvalSurveillanceCommandType,
} from './shared.js';

import type {
	ClearHabitatInaccessibleCommand,
	CreateHabitatCommand,
	CreateHabitatFromInspectionCommand,
	DeleteHabitatCommand,
	MarkHabitatInaccessibleCommand,
	MergeHabitatsCommand,
	ReactivateHabitatCommand,
	RetireHabitatCommand,
	UpdateHabitatConfigurationCommand,
	UpdateHabitatDetailsCommand,
	UpdateHabitatLocationCommand,
} from './habitats.js';
import type {
	DeleteInspectionCommand,
	RecordAdHocInspectionCommand,
	RecordHabitatInspectionCommand,
	UpdateAdHocInspectionLocationCommand,
	UpdateInspectionFieldDetailsCommand,
} from './inspections.js';
import type {
	AddSampleSpeciesCountCommand,
	DeleteSampleSpeciesCountCommand,
	UpdateSampleSpeciesCountCommand,
} from './sample-species.js';
import type {
	AddInspectionSampleCommand,
	AddUnlabeledInspectionSampleCommand,
	ClearSampleZeroLarvaeCommand,
	DeleteInspectionSampleCommand,
	MarkSampleZeroLarvaeCommand,
	SetSampleNonMosquitoPresenceCommand,
	SetSampleUnidentifiableReasonCommand,
	UpdateInspectionSampleCommand,
} from './samples.js';

export type LarvalSurveillanceCommand =
	| CreateHabitatCommand
	| CreateHabitatFromInspectionCommand
	| UpdateHabitatDetailsCommand
	| UpdateHabitatLocationCommand
	| UpdateHabitatConfigurationCommand
	| MarkHabitatInaccessibleCommand
	| ClearHabitatInaccessibleCommand
	| RetireHabitatCommand
	| ReactivateHabitatCommand
	| DeleteHabitatCommand
	| MergeHabitatsCommand
	| RecordHabitatInspectionCommand
	| RecordAdHocInspectionCommand
	| UpdateInspectionFieldDetailsCommand
	| UpdateAdHocInspectionLocationCommand
	| DeleteInspectionCommand
	| AddInspectionSampleCommand
	| AddUnlabeledInspectionSampleCommand
	| UpdateInspectionSampleCommand
	| DeleteInspectionSampleCommand
	| MarkSampleZeroLarvaeCommand
	| ClearSampleZeroLarvaeCommand
	| SetSampleNonMosquitoPresenceCommand
	| SetSampleUnidentifiableReasonCommand
	| AddSampleSpeciesCountCommand
	| UpdateSampleSpeciesCountCommand
	| DeleteSampleSpeciesCountCommand;
