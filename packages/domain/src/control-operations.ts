export * from './control-operations/actions.js';
export * from './control-operations/assets.js';
export type {
	ControlOperationsCommandType,
	ControlOperationsDomainCommand,
	InsecticideType,
} from './control-operations/core.js';
export * from './control-operations/methods.js';
export * from './control-operations/products.js';
export * from './control-operations/requests.js';
export type {
	ApplicationBatchInput,
	ControlActionContext,
	ControlType,
} from './performed-control-actions.js';

import type {
	AddChemicalApplicationBatchCommand,
	DeleteBiocontrolActionCommand,
	DeleteChemicalApplicationCommand,
	DeleteOutreachActionCommand,
	DeleteSourceReductionCommand,
	RecordBiocontrolActionCommand,
	RecordChemicalApplicationCommand,
	RecordOutreachActionCommand,
	RecordSourceReductionCommand,
	RemoveChemicalApplicationBatchCommand,
	UpdateBiocontrolActionFieldDetailsCommand,
	UpdateBiocontrolActionLocationAndContextCommand,
	UpdateChemicalApplicationFieldDetailsCommand,
	UpdateChemicalApplicationLocationAndContextCommand,
	UpdateOutreachActionFieldDetailsCommand,
	UpdateOutreachActionLocationAndContextCommand,
	UpdateSourceReductionFieldDetailsCommand,
	UpdateSourceReductionLocationAndContextCommand,
} from './control-operations/actions.js';
import type {
	CreateEquipmentCommand,
	CreateVehicleCommand,
	DeactivateEquipmentCommand,
	DeactivateVehicleCommand,
	DeleteEquipmentCommand,
	DeleteVehicleCommand,
	ReactivateEquipmentCommand,
	ReactivateVehicleCommand,
	UpdateEquipmentCommand,
	UpdateVehicleCommand,
} from './control-operations/assets.js';
import type {
	CreateApplicationMethodCommand,
	CreateBiocontrolMethodCommand,
	CreateOutreachMethodCommand,
	CreateSourceReductionMethodCommand,
	DeactivateApplicationMethodCommand,
	DeactivateBiocontrolMethodCommand,
	DeactivateOutreachMethodCommand,
	DeactivateSourceReductionMethodCommand,
	DeleteApplicationMethodCommand,
	DeleteBiocontrolMethodCommand,
	DeleteOutreachMethodCommand,
	DeleteSourceReductionMethodCommand,
	ReactivateApplicationMethodCommand,
	ReactivateBiocontrolMethodCommand,
	ReactivateOutreachMethodCommand,
	ReactivateSourceReductionMethodCommand,
	UpdateApplicationMethodCommand,
	UpdateBiocontrolMethodCommand,
	UpdateOutreachMethodCommand,
	UpdateSourceReductionMethodCommand,
} from './control-operations/methods.js';
import type {
	ActivateFormulationCommand,
	AddFormulationInsecticideCommand,
	CreateFormulationCommand,
	CreateInsecticideBatchCommand,
	CreateInsecticideCommand,
	DeactivateFormulationCommand,
	DeactivateInsecticideBatchCommand,
	DeactivateInsecticideCommand,
	DeleteFormulationCommand,
	DeleteInsecticideBatchCommand,
	DeleteInsecticideCommand,
	ReactivateInsecticideBatchCommand,
	ReactivateInsecticideCommand,
	RemoveFormulationInsecticideCommand,
	UpdateFormulationDetailsCommand,
	UpdateFormulationInsecticideCommand,
	UpdateInsecticideBatchCommand,
	UpdateInsecticideCommand,
} from './control-operations/products.js';
import type {
	DeleteRequestedControlActionCommand,
	ReopenRequestedControlActionCommand,
	RequestControlActionCommand,
	ResolveRequestedControlActionCommand,
	UpdateRequestedControlActionDetailsCommand,
	UpdateRequestedControlActionLocationAndContextCommand,
} from './control-operations/requests.js';

export type ControlOperationsCommand =
	| CreateApplicationMethodCommand
	| UpdateApplicationMethodCommand
	| DeactivateApplicationMethodCommand
	| ReactivateApplicationMethodCommand
	| DeleteApplicationMethodCommand
	| CreateSourceReductionMethodCommand
	| UpdateSourceReductionMethodCommand
	| DeactivateSourceReductionMethodCommand
	| ReactivateSourceReductionMethodCommand
	| DeleteSourceReductionMethodCommand
	| CreateOutreachMethodCommand
	| UpdateOutreachMethodCommand
	| DeactivateOutreachMethodCommand
	| ReactivateOutreachMethodCommand
	| DeleteOutreachMethodCommand
	| CreateBiocontrolMethodCommand
	| UpdateBiocontrolMethodCommand
	| DeactivateBiocontrolMethodCommand
	| ReactivateBiocontrolMethodCommand
	| DeleteBiocontrolMethodCommand
	| CreateVehicleCommand
	| UpdateVehicleCommand
	| DeactivateVehicleCommand
	| ReactivateVehicleCommand
	| DeleteVehicleCommand
	| CreateEquipmentCommand
	| UpdateEquipmentCommand
	| DeactivateEquipmentCommand
	| ReactivateEquipmentCommand
	| DeleteEquipmentCommand
	| CreateInsecticideCommand
	| UpdateInsecticideCommand
	| DeactivateInsecticideCommand
	| ReactivateInsecticideCommand
	| DeleteInsecticideCommand
	| CreateInsecticideBatchCommand
	| UpdateInsecticideBatchCommand
	| DeactivateInsecticideBatchCommand
	| ReactivateInsecticideBatchCommand
	| DeleteInsecticideBatchCommand
	| CreateFormulationCommand
	| UpdateFormulationDetailsCommand
	| ActivateFormulationCommand
	| DeactivateFormulationCommand
	| DeleteFormulationCommand
	| AddFormulationInsecticideCommand
	| UpdateFormulationInsecticideCommand
	| RemoveFormulationInsecticideCommand
	| RecordChemicalApplicationCommand
	| UpdateChemicalApplicationFieldDetailsCommand
	| UpdateChemicalApplicationLocationAndContextCommand
	| DeleteChemicalApplicationCommand
	| AddChemicalApplicationBatchCommand
	| RemoveChemicalApplicationBatchCommand
	| RecordSourceReductionCommand
	| UpdateSourceReductionFieldDetailsCommand
	| UpdateSourceReductionLocationAndContextCommand
	| DeleteSourceReductionCommand
	| RecordOutreachActionCommand
	| UpdateOutreachActionFieldDetailsCommand
	| UpdateOutreachActionLocationAndContextCommand
	| DeleteOutreachActionCommand
	| RecordBiocontrolActionCommand
	| UpdateBiocontrolActionFieldDetailsCommand
	| UpdateBiocontrolActionLocationAndContextCommand
	| DeleteBiocontrolActionCommand
	| RequestControlActionCommand
	| UpdateRequestedControlActionDetailsCommand
	| UpdateRequestedControlActionLocationAndContextCommand
	| ResolveRequestedControlActionCommand
	| ReopenRequestedControlActionCommand
	| DeleteRequestedControlActionCommand;
