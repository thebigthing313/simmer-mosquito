import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type JsonObject,
	type LocalDateString,
} from './adult-surveillance.js';
import type { UnitType } from './organization-settings.js';

export type ControlType = 'application' | 'source_reduction' | 'biocontrol' | 'outreach';
export type InsecticideType = 'larvicide' | 'adulticide' | 'pupicide' | 'other';

export type ControlActionContext =
	| { readonly kind: 'none' }
	| {
			readonly kind: 'larval';
			readonly habitatId?: DomainId;
			readonly inspectionId?: DomainId;
	  }
	| { readonly kind: 'adult'; readonly collectionId: DomainId };

export interface ApplicationBatchInput {
	readonly applicationBatchId: DomainId;
	readonly insecticideBatchId: DomainId;
}

export type ControlOperationsCommandType =
	| 'controlOperations.createApplicationMethod'
	| 'controlOperations.updateApplicationMethod'
	| 'controlOperations.deactivateApplicationMethod'
	| 'controlOperations.reactivateApplicationMethod'
	| 'controlOperations.deleteApplicationMethod'
	| 'controlOperations.createSourceReductionMethod'
	| 'controlOperations.updateSourceReductionMethod'
	| 'controlOperations.deactivateSourceReductionMethod'
	| 'controlOperations.reactivateSourceReductionMethod'
	| 'controlOperations.deleteSourceReductionMethod'
	| 'controlOperations.createOutreachMethod'
	| 'controlOperations.updateOutreachMethod'
	| 'controlOperations.deactivateOutreachMethod'
	| 'controlOperations.reactivateOutreachMethod'
	| 'controlOperations.deleteOutreachMethod'
	| 'controlOperations.createBiocontrolMethod'
	| 'controlOperations.updateBiocontrolMethod'
	| 'controlOperations.deactivateBiocontrolMethod'
	| 'controlOperations.reactivateBiocontrolMethod'
	| 'controlOperations.deleteBiocontrolMethod'
	| 'controlOperations.createVehicle'
	| 'controlOperations.updateVehicle'
	| 'controlOperations.deactivateVehicle'
	| 'controlOperations.reactivateVehicle'
	| 'controlOperations.deleteVehicle'
	| 'controlOperations.createEquipment'
	| 'controlOperations.updateEquipment'
	| 'controlOperations.deactivateEquipment'
	| 'controlOperations.reactivateEquipment'
	| 'controlOperations.deleteEquipment'
	| 'controlOperations.createInsecticide'
	| 'controlOperations.updateInsecticide'
	| 'controlOperations.deactivateInsecticide'
	| 'controlOperations.reactivateInsecticide'
	| 'controlOperations.deleteInsecticide'
	| 'controlOperations.createInsecticideBatch'
	| 'controlOperations.updateInsecticideBatch'
	| 'controlOperations.deactivateInsecticideBatch'
	| 'controlOperations.reactivateInsecticideBatch'
	| 'controlOperations.deleteInsecticideBatch'
	| 'controlOperations.createFormulation'
	| 'controlOperations.updateFormulationDetails'
	| 'controlOperations.activateFormulation'
	| 'controlOperations.deactivateFormulation'
	| 'controlOperations.deleteFormulation'
	| 'controlOperations.addFormulationInsecticide'
	| 'controlOperations.updateFormulationInsecticide'
	| 'controlOperations.removeFormulationInsecticide'
	| 'controlOperations.recordChemicalApplication'
	| 'controlOperations.updateChemicalApplicationFieldDetails'
	| 'controlOperations.updateChemicalApplicationLocationAndContext'
	| 'controlOperations.deleteChemicalApplication'
	| 'controlOperations.addChemicalApplicationBatch'
	| 'controlOperations.removeChemicalApplicationBatch'
	| 'controlOperations.recordSourceReduction'
	| 'controlOperations.updateSourceReductionFieldDetails'
	| 'controlOperations.updateSourceReductionLocationAndContext'
	| 'controlOperations.deleteSourceReduction'
	| 'controlOperations.recordOutreachAction'
	| 'controlOperations.updateOutreachActionFieldDetails'
	| 'controlOperations.updateOutreachActionLocationAndContext'
	| 'controlOperations.deleteOutreachAction'
	| 'controlOperations.recordBiocontrolAction'
	| 'controlOperations.updateBiocontrolActionFieldDetails'
	| 'controlOperations.updateBiocontrolActionLocationAndContext'
	| 'controlOperations.deleteBiocontrolAction'
	| 'controlOperations.requestControlAction'
	| 'controlOperations.updateRequestedControlActionDetails'
	| 'controlOperations.updateRequestedControlActionLocationAndContext'
	| 'controlOperations.resolveRequestedControlAction'
	| 'controlOperations.reopenRequestedControlAction'
	| 'controlOperations.deleteRequestedControlAction';

export interface ControlOperationsDomainCommand<
	TType extends ControlOperationsCommandType,
	TPayload,
> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface ControlCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface ControlCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export type ControlMethodKind =
	| 'applicationMethod'
	| 'sourceReductionMethod'
	| 'outreachMethod'
	| 'biocontrolMethod';

interface MethodCommandInput extends ControlCommandInput {
	readonly name: string;
	readonly customSchema?: unknown | null;
}

interface MethodCommandPayload extends ControlCommandPayload {
	readonly name: string;
	readonly customSchema: JsonObject | null;
}

export interface CreateApplicationMethodCommandInput extends MethodCommandInput {
	readonly applicationMethodId: DomainId;
}

export type CreateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createApplicationMethod',
	MethodCommandPayload & { readonly applicationMethodId: DomainId }
>;

export interface UpdateApplicationMethodCommandInput extends ControlCommandInput {
	readonly applicationMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateApplicationMethod',
	ControlCommandPayload & {
		readonly applicationMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface ApplicationMethodIdCommandInput extends ControlCommandInput {
	readonly applicationMethodId: DomainId;
}

export type DeactivateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateApplicationMethod',
	ControlCommandPayload & { readonly applicationMethodId: DomainId }
>;

export type ReactivateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateApplicationMethod',
	ControlCommandPayload & { readonly applicationMethodId: DomainId }
>;

export type DeleteApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteApplicationMethod',
	ControlCommandPayload & { readonly applicationMethodId: DomainId }
>;

export interface CreateSourceReductionMethodCommandInput extends MethodCommandInput {
	readonly sourceReductionMethodId: DomainId;
}

export type CreateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createSourceReductionMethod',
	MethodCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export interface UpdateSourceReductionMethodCommandInput extends ControlCommandInput {
	readonly sourceReductionMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateSourceReductionMethod',
	ControlCommandPayload & {
		readonly sourceReductionMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface SourceReductionMethodIdCommandInput extends ControlCommandInput {
	readonly sourceReductionMethodId: DomainId;
}

export type DeactivateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateSourceReductionMethod',
	ControlCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export type ReactivateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateSourceReductionMethod',
	ControlCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export type DeleteSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteSourceReductionMethod',
	ControlCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export interface CreateOutreachMethodCommandInput extends MethodCommandInput {
	readonly outreachMethodId: DomainId;
}

export type CreateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createOutreachMethod',
	MethodCommandPayload & { readonly outreachMethodId: DomainId }
>;

export interface UpdateOutreachMethodCommandInput extends ControlCommandInput {
	readonly outreachMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateOutreachMethod',
	ControlCommandPayload & {
		readonly outreachMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface OutreachMethodIdCommandInput extends ControlCommandInput {
	readonly outreachMethodId: DomainId;
}

export type DeactivateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateOutreachMethod',
	ControlCommandPayload & { readonly outreachMethodId: DomainId }
>;

export type ReactivateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateOutreachMethod',
	ControlCommandPayload & { readonly outreachMethodId: DomainId }
>;

export type DeleteOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteOutreachMethod',
	ControlCommandPayload & { readonly outreachMethodId: DomainId }
>;

export interface CreateBiocontrolMethodCommandInput extends MethodCommandInput {
	readonly biocontrolMethodId: DomainId;
}

export type CreateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createBiocontrolMethod',
	MethodCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export interface UpdateBiocontrolMethodCommandInput extends ControlCommandInput {
	readonly biocontrolMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateBiocontrolMethod',
	ControlCommandPayload & {
		readonly biocontrolMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface BiocontrolMethodIdCommandInput extends ControlCommandInput {
	readonly biocontrolMethodId: DomainId;
}

export type DeactivateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateBiocontrolMethod',
	ControlCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export type ReactivateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateBiocontrolMethod',
	ControlCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export type DeleteBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteBiocontrolMethod',
	ControlCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export interface CreateVehicleCommandInput extends ControlCommandInput {
	readonly vehicleId: DomainId;
	readonly vehicleName: string;
	readonly metadata?: unknown | null;
}

export type CreateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.createVehicle',
	ControlCommandPayload & {
		readonly vehicleId: DomainId;
		readonly vehicleName: string;
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateVehicleCommandInput extends ControlCommandInput {
	readonly vehicleId: DomainId;
	readonly vehicleName?: string;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalVehicleLabelChange?: boolean;
}

export type UpdateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.updateVehicle',
	ControlCommandPayload & {
		readonly vehicleId: DomainId;
		readonly changes: Readonly<{
			readonly vehicleName?: string;
			readonly metadata?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalVehicleLabelChange: boolean;
	}
>;

export interface VehicleIdCommandInput extends ControlCommandInput {
	readonly vehicleId: DomainId;
}

export type DeactivateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateVehicle',
	ControlCommandPayload & { readonly vehicleId: DomainId }
>;

export type ReactivateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateVehicle',
	ControlCommandPayload & { readonly vehicleId: DomainId }
>;

export type DeleteVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteVehicle',
	ControlCommandPayload & { readonly vehicleId: DomainId }
>;

export interface CreateEquipmentCommandInput extends ControlCommandInput {
	readonly equipmentId: DomainId;
	readonly equipmentName: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
}

export type CreateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.createEquipment',
	ControlCommandPayload & {
		readonly equipmentId: DomainId;
		readonly equipmentName: string;
		readonly serialNumber: string | null;
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateEquipmentCommandInput extends ControlCommandInput {
	readonly equipmentId: DomainId;
	readonly equipmentName?: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalEquipmentLabelChange?: boolean;
}

export type UpdateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.updateEquipment',
	ControlCommandPayload & {
		readonly equipmentId: DomainId;
		readonly changes: Readonly<{
			readonly equipmentName?: string;
			readonly serialNumber?: string | null;
			readonly metadata?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalEquipmentLabelChange: boolean;
	}
>;

export interface EquipmentIdCommandInput extends ControlCommandInput {
	readonly equipmentId: DomainId;
}

export type DeactivateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateEquipment',
	ControlCommandPayload & { readonly equipmentId: DomainId }
>;

export type ReactivateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateEquipment',
	ControlCommandPayload & { readonly equipmentId: DomainId }
>;

export type DeleteEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteEquipment',
	ControlCommandPayload & { readonly equipmentId: DomainId }
>;

export interface CreateInsecticideCommandInput extends ControlCommandInput {
	readonly insecticideId: DomainId;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: DomainId;
	readonly labelUrl?: string | null;
	readonly msdsUrl?: string | null;
	readonly shorthand?: string | null;
	readonly metadata?: unknown | null;
}

export type CreateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.createInsecticide',
	ControlCommandPayload & {
		readonly insecticideId: DomainId;
		readonly tradeName: string;
		readonly activeIngredient: string;
		readonly type: InsecticideType;
		readonly registrationNumber: string;
		readonly defaultUnitId: DomainId;
		readonly labelUrl: string | null;
		readonly msdsUrl: string | null;
		readonly shorthand: string | null;
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateInsecticideCommandInput extends ControlCommandInput {
	readonly insecticideId: DomainId;
	readonly tradeName?: string;
	readonly activeIngredient?: string;
	readonly type?: InsecticideType;
	readonly registrationNumber?: string;
	readonly defaultUnitId?: DomainId;
	readonly labelUrl?: string | null;
	readonly msdsUrl?: string | null;
	readonly shorthand?: string | null;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalProductChange?: boolean;
}

export type UpdateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.updateInsecticide',
	ControlCommandPayload & {
		readonly insecticideId: DomainId;
		readonly changes: Readonly<{
			readonly tradeName?: string;
			readonly activeIngredient?: string;
			readonly type?: InsecticideType;
			readonly registrationNumber?: string;
			readonly defaultUnitId?: DomainId;
			readonly labelUrl?: string | null;
			readonly msdsUrl?: string | null;
			readonly shorthand?: string | null;
			readonly metadata?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalProductChange: boolean;
	}
>;

export interface InsecticideIdCommandInput extends ControlCommandInput {
	readonly insecticideId: DomainId;
}

export interface DeactivateInsecticideCommandInput extends InsecticideIdCommandInput {
	readonly acknowledgedDependentDeactivation?: boolean;
}

export type DeactivateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateInsecticide',
	ControlCommandPayload & {
		readonly insecticideId: DomainId;
		readonly acknowledgedDependentDeactivation: boolean;
	}
>;

export type ReactivateInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateInsecticide',
	ControlCommandPayload & { readonly insecticideId: DomainId }
>;

export type DeleteInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteInsecticide',
	ControlCommandPayload & { readonly insecticideId: DomainId }
>;

export interface CreateInsecticideBatchCommandInput extends ControlCommandInput {
	readonly insecticideBatchId: DomainId;
	readonly insecticideId: DomainId;
	readonly batchName: string;
}

export type CreateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.createInsecticideBatch',
	ControlCommandPayload & {
		readonly insecticideBatchId: DomainId;
		readonly insecticideId: DomainId;
		readonly batchName: string;
	}
>;

export interface UpdateInsecticideBatchCommandInput extends ControlCommandInput {
	readonly insecticideBatchId: DomainId;
	readonly batchName?: string;
	readonly acknowledgedHistoricalBatchLabelChange?: boolean;
}

export type UpdateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.updateInsecticideBatch',
	ControlCommandPayload & {
		readonly insecticideBatchId: DomainId;
		readonly changes: Readonly<{ readonly batchName?: string }>;
		readonly acknowledgedHistoricalBatchLabelChange: boolean;
	}
>;

export interface InsecticideBatchIdCommandInput extends ControlCommandInput {
	readonly insecticideBatchId: DomainId;
}

export type DeactivateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateInsecticideBatch',
	ControlCommandPayload & { readonly insecticideBatchId: DomainId }
>;

export type ReactivateInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateInsecticideBatch',
	ControlCommandPayload & { readonly insecticideBatchId: DomainId }
>;

export type DeleteInsecticideBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteInsecticideBatch',
	ControlCommandPayload & { readonly insecticideBatchId: DomainId }
>;

export interface CreateFormulationCommandInput extends ControlCommandInput {
	readonly formulationId: DomainId;
	readonly formulationName: string;
	readonly description?: string | null;
	readonly diluentRatio?: number;
}

export type CreateFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.createFormulation',
	ControlCommandPayload & {
		readonly formulationId: DomainId;
		readonly formulationName: string;
		readonly description: string | null;
		readonly diluentRatio: number;
	}
>;

export interface UpdateFormulationDetailsCommandInput extends ControlCommandInput {
	readonly formulationId: DomainId;
	readonly formulationName?: string;
	readonly description?: string | null;
	readonly diluentRatio?: number;
}

export type UpdateFormulationDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateFormulationDetails',
	ControlCommandPayload & {
		readonly formulationId: DomainId;
		readonly changes: Readonly<{
			readonly formulationName?: string;
			readonly description?: string | null;
			readonly diluentRatio?: number;
		}>;
	}
>;

export interface FormulationIdCommandInput extends ControlCommandInput {
	readonly formulationId: DomainId;
}

export type ActivateFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.activateFormulation',
	ControlCommandPayload & { readonly formulationId: DomainId }
>;

export type DeactivateFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateFormulation',
	ControlCommandPayload & { readonly formulationId: DomainId }
>;

export interface DeleteFormulationCommandInput extends FormulationIdCommandInput {
	readonly acknowledgedComponentDeletion?: boolean;
}

export type DeleteFormulationCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteFormulation',
	ControlCommandPayload & {
		readonly formulationId: DomainId;
		readonly acknowledgedComponentDeletion: boolean;
	}
>;

export interface AddFormulationInsecticideCommandInput extends ControlCommandInput {
	readonly formulationInsecticideId: DomainId;
	readonly formulationId: DomainId;
	readonly insecticideId: DomainId;
	readonly ratio: number;
}

export type AddFormulationInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.addFormulationInsecticide',
	ControlCommandPayload & {
		readonly formulationInsecticideId: DomainId;
		readonly formulationId: DomainId;
		readonly insecticideId: DomainId;
		readonly ratio: number;
	}
>;

export interface UpdateFormulationInsecticideCommandInput extends ControlCommandInput {
	readonly formulationInsecticideId: DomainId;
	readonly insecticideId?: DomainId;
	readonly ratio?: number;
	readonly acknowledgedDeactivateEmptyFormulation?: boolean;
}

export type UpdateFormulationInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.updateFormulationInsecticide',
	ControlCommandPayload & {
		readonly formulationInsecticideId: DomainId;
		readonly changes: Readonly<{
			readonly insecticideId?: DomainId;
			readonly ratio?: number;
		}>;
		readonly acknowledgedDeactivateEmptyFormulation: boolean;
	}
>;

export interface RemoveFormulationInsecticideCommandInput extends ControlCommandInput {
	readonly formulationInsecticideId: DomainId;
	readonly acknowledgedDeactivateEmptyFormulation?: boolean;
}

export type RemoveFormulationInsecticideCommand = ControlOperationsDomainCommand<
	'controlOperations.removeFormulationInsecticide',
	ControlCommandPayload & {
		readonly formulationInsecticideId: DomainId;
		readonly acknowledgedDeactivateEmptyFormulation: boolean;
	}
>;

export interface RecordChemicalApplicationCommandInput extends ControlCommandInput {
	readonly applicationId: DomainId;
	readonly insecticideId: DomainId;
	readonly amountApplied: number;
	readonly applicationUnitId: DomainId;
	readonly applicationDate: LocalDateString;
	readonly applicatorProfileId?: DomainId | null;
	readonly featureId: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
	readonly applicationMethodId?: DomainId | null;
	readonly vehicleId?: DomainId | null;
	readonly equipmentId?: DomainId | null;
	readonly applicationBatches?: readonly ApplicationBatchInput[];
	readonly metadata?: unknown | null;
}

export type RecordChemicalApplicationCommand = ControlOperationsDomainCommand<
	'controlOperations.recordChemicalApplication',
	ControlCommandPayload & {
		readonly applicationId: DomainId;
		readonly insecticideId: DomainId;
		readonly amountApplied: number;
		readonly applicationUnitId: DomainId;
		readonly applicationDate: LocalDateString;
		readonly applicatorProfileId: DomainId;
		readonly featureId: DomainId;
		readonly addressId: DomainId | null;
		readonly context: ControlActionContext;
		readonly requestedControlActionId: DomainId | null;
		readonly applicationMethodId: DomainId | null;
		readonly vehicleId: DomainId | null;
		readonly equipmentId: DomainId | null;
		readonly applicationBatches: readonly ApplicationBatchInput[];
		readonly metadata: JsonObject | null;
	}
>;

export interface UpdateChemicalApplicationFieldDetailsCommandInput extends ControlCommandInput {
	readonly applicationId: DomainId;
	readonly applicationDate?: LocalDateString;
	readonly applicatorProfileId?: DomainId | null;
	readonly applicationMethodId?: DomainId | null;
	readonly insecticideId?: DomainId;
	readonly amountApplied?: number;
	readonly applicationUnitId?: DomainId;
	readonly vehicleId?: DomainId | null;
	readonly equipmentId?: DomainId | null;
	readonly metadata?: unknown | null;
	readonly acknowledgedBatchClearance?: boolean;
}

export type UpdateChemicalApplicationFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateChemicalApplicationFieldDetails',
	ControlCommandPayload & {
		readonly applicationId: DomainId;
		readonly changes: Readonly<{
			readonly applicationDate?: LocalDateString;
			readonly applicatorProfileId?: DomainId | null;
			readonly applicationMethodId?: DomainId | null;
			readonly insecticideId?: DomainId;
			readonly amountApplied?: number;
			readonly applicationUnitId?: DomainId;
			readonly vehicleId?: DomainId | null;
			readonly equipmentId?: DomainId | null;
			readonly metadata?: JsonObject | null;
		}>;
		readonly acknowledgedBatchClearance: boolean;
	}
>;

export interface UpdateChemicalApplicationLocationAndContextCommandInput
	extends ControlCommandInput {
	readonly applicationId: DomainId;
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateChemicalApplicationLocationAndContextCommand =
	ControlOperationsDomainCommand<
		'controlOperations.updateChemicalApplicationLocationAndContext',
		ControlCommandPayload & {
			readonly applicationId: DomainId;
			readonly changes: Readonly<{
				readonly featureId?: DomainId;
				readonly addressId?: DomainId | null;
				readonly context?: ControlActionContext;
				readonly requestedControlActionId?: DomainId | null;
			}>;
		}
	>;

export interface DeleteChemicalApplicationCommandInput extends ControlCommandInput {
	readonly applicationId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
	readonly acknowledgedBatchDeletion?: boolean;
}

export type DeleteChemicalApplicationCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteChemicalApplication',
	ControlCommandPayload & {
		readonly applicationId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
		readonly acknowledgedBatchDeletion: boolean;
	}
>;

export interface AddChemicalApplicationBatchCommandInput extends ControlCommandInput {
	readonly applicationBatchId: DomainId;
	readonly applicationId: DomainId;
	readonly insecticideBatchId: DomainId;
}

export type AddChemicalApplicationBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.addChemicalApplicationBatch',
	ControlCommandPayload & ApplicationBatchInput & { readonly applicationId: DomainId }
>;

export interface RemoveChemicalApplicationBatchCommandInput extends ControlCommandInput {
	readonly applicationBatchId: DomainId;
}

export type RemoveChemicalApplicationBatchCommand = ControlOperationsDomainCommand<
	'controlOperations.removeChemicalApplicationBatch',
	ControlCommandPayload & { readonly applicationBatchId: DomainId }
>;

interface ActionBaseInput extends ControlCommandInput {
	readonly featureId: DomainId;
	readonly addressId?: DomainId | null;
	readonly requestedControlActionId?: DomainId | null;
	readonly metadata?: unknown | null;
}

interface ActionBasePayload extends ControlCommandPayload {
	readonly featureId: DomainId;
	readonly addressId: DomainId | null;
	readonly requestedControlActionId: DomainId | null;
	readonly metadata: JsonObject | null;
}

export interface RecordSourceReductionCommandInput extends ActionBaseInput {
	readonly sourceReductionId: DomainId;
	readonly sourceReductionMethodId: DomainId;
	readonly technicianProfileId?: DomainId | null;
	readonly sourceReductionDate: LocalDateString;
	readonly context?: ControlActionContext;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: DomainId;
}

export type RecordSourceReductionCommand = ControlOperationsDomainCommand<
	'controlOperations.recordSourceReduction',
	ActionBasePayload & {
		readonly sourceReductionId: DomainId;
		readonly sourceReductionMethodId: DomainId;
		readonly technicianProfileId: DomainId;
		readonly sourceReductionDate: LocalDateString;
		readonly context: ControlActionContext;
		readonly sourcesEliminatedAmount: number;
		readonly sourcesEliminatedUnitId: DomainId;
	}
>;

export interface UpdateSourceReductionFieldDetailsCommandInput extends ControlCommandInput {
	readonly sourceReductionId: DomainId;
	readonly sourceReductionDate?: LocalDateString;
	readonly technicianProfileId?: DomainId | null;
	readonly sourceReductionMethodId?: DomainId;
	readonly sourcesEliminatedAmount?: number;
	readonly sourcesEliminatedUnitId?: DomainId;
	readonly metadata?: unknown | null;
}

export type UpdateSourceReductionFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateSourceReductionFieldDetails',
	ControlCommandPayload & {
		readonly sourceReductionId: DomainId;
		readonly changes: Readonly<{
			readonly sourceReductionDate?: LocalDateString;
			readonly technicianProfileId?: DomainId | null;
			readonly sourceReductionMethodId?: DomainId;
			readonly sourcesEliminatedAmount?: number;
			readonly sourcesEliminatedUnitId?: DomainId;
			readonly metadata?: JsonObject | null;
		}>;
	}
>;

export interface UpdateSourceReductionLocationAndContextCommandInput extends ControlCommandInput {
	readonly sourceReductionId: DomainId;
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateSourceReductionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateSourceReductionLocationAndContext',
	ControlCommandPayload & {
		readonly sourceReductionId: DomainId;
		readonly changes: Readonly<{
			readonly featureId?: DomainId;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface DeleteSourceReductionCommandInput extends ControlCommandInput {
	readonly sourceReductionId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
}

export type DeleteSourceReductionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteSourceReduction',
	ControlCommandPayload & {
		readonly sourceReductionId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
	}
>;

export interface RecordOutreachActionCommandInput extends ActionBaseInput {
	readonly outreachActionId: DomainId;
	readonly outreachMethodId: DomainId;
	readonly technicianProfileId?: DomainId | null;
	readonly outreachDate: LocalDateString;
	readonly context?: ControlActionContext;
	readonly reach: number;
	readonly reachDescription?: string | null;
}

export type RecordOutreachActionCommand = ControlOperationsDomainCommand<
	'controlOperations.recordOutreachAction',
	ActionBasePayload & {
		readonly outreachActionId: DomainId;
		readonly outreachMethodId: DomainId;
		readonly technicianProfileId: DomainId;
		readonly outreachDate: LocalDateString;
		readonly context: ControlActionContext;
		readonly reach: number;
		readonly reachDescription: string | null;
	}
>;

export interface UpdateOutreachActionFieldDetailsCommandInput extends ControlCommandInput {
	readonly outreachActionId: DomainId;
	readonly outreachDate?: LocalDateString;
	readonly technicianProfileId?: DomainId | null;
	readonly outreachMethodId?: DomainId;
	readonly reach?: number;
	readonly reachDescription?: string | null;
	readonly metadata?: unknown | null;
}

export type UpdateOutreachActionFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateOutreachActionFieldDetails',
	ControlCommandPayload & {
		readonly outreachActionId: DomainId;
		readonly changes: Readonly<{
			readonly outreachDate?: LocalDateString;
			readonly technicianProfileId?: DomainId | null;
			readonly outreachMethodId?: DomainId;
			readonly reach?: number;
			readonly reachDescription?: string | null;
			readonly metadata?: JsonObject | null;
		}>;
	}
>;

export interface UpdateOutreachActionLocationAndContextCommandInput extends ControlCommandInput {
	readonly outreachActionId: DomainId;
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateOutreachActionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateOutreachActionLocationAndContext',
	ControlCommandPayload & {
		readonly outreachActionId: DomainId;
		readonly changes: Readonly<{
			readonly featureId?: DomainId;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface DeleteOutreachActionCommandInput extends ControlCommandInput {
	readonly outreachActionId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
}

export type DeleteOutreachActionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteOutreachAction',
	ControlCommandPayload & {
		readonly outreachActionId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
	}
>;

export interface RecordBiocontrolActionCommandInput extends ActionBaseInput {
	readonly biocontrolActionId: DomainId;
	readonly biocontrolMethodId: DomainId;
	readonly technicianProfileId?: DomainId | null;
	readonly biocontrolDate: LocalDateString;
	readonly context?: ControlActionContext;
	readonly amountReleased: number;
	readonly releaseUnitId: DomainId;
}

export type RecordBiocontrolActionCommand = ControlOperationsDomainCommand<
	'controlOperations.recordBiocontrolAction',
	ActionBasePayload & {
		readonly biocontrolActionId: DomainId;
		readonly biocontrolMethodId: DomainId;
		readonly technicianProfileId: DomainId;
		readonly biocontrolDate: LocalDateString;
		readonly context: ControlActionContext;
		readonly amountReleased: number;
		readonly releaseUnitId: DomainId;
	}
>;

export interface UpdateBiocontrolActionFieldDetailsCommandInput extends ControlCommandInput {
	readonly biocontrolActionId: DomainId;
	readonly biocontrolDate?: LocalDateString;
	readonly technicianProfileId?: DomainId | null;
	readonly biocontrolMethodId?: DomainId;
	readonly amountReleased?: number;
	readonly releaseUnitId?: DomainId;
	readonly metadata?: unknown | null;
}

export type UpdateBiocontrolActionFieldDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateBiocontrolActionFieldDetails',
	ControlCommandPayload & {
		readonly biocontrolActionId: DomainId;
		readonly changes: Readonly<{
			readonly biocontrolDate?: LocalDateString;
			readonly technicianProfileId?: DomainId | null;
			readonly biocontrolMethodId?: DomainId;
			readonly amountReleased?: number;
			readonly releaseUnitId?: DomainId;
			readonly metadata?: JsonObject | null;
		}>;
	}
>;

export interface UpdateBiocontrolActionLocationAndContextCommandInput extends ControlCommandInput {
	readonly biocontrolActionId: DomainId;
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}

export type UpdateBiocontrolActionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateBiocontrolActionLocationAndContext',
	ControlCommandPayload & {
		readonly biocontrolActionId: DomainId;
		readonly changes: Readonly<{
			readonly featureId?: DomainId;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
			readonly requestedControlActionId?: DomainId | null;
		}>;
	}
>;

export interface DeleteBiocontrolActionCommandInput extends ControlCommandInput {
	readonly biocontrolActionId: DomainId;
	readonly acknowledgedSupportRecordDeletion?: boolean;
}

export type DeleteBiocontrolActionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteBiocontrolAction',
	ControlCommandPayload & {
		readonly biocontrolActionId: DomainId;
		readonly acknowledgedSupportRecordDeletion: boolean;
	}
>;

export interface RequestControlActionCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly controlType: ControlType;
	readonly featureId: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly recommendedMethodId?: DomainId | null;
	readonly summary?: string | null;
	readonly requestedByProfileId?: DomainId | null;
	readonly requestedAt?: Date | null;
}

export type RequestControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.requestControlAction',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly controlType: ControlType;
		readonly featureId: DomainId;
		readonly addressId: DomainId | null;
		readonly context: ControlActionContext;
		readonly recommendedMethodId: DomainId | null;
		readonly summary: string | null;
		readonly requestedByProfileId: DomainId;
		readonly requestedAt: Date | null;
	}
>;

export interface UpdateRequestedControlActionDetailsCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly controlType?: ControlType;
	readonly recommendedMethodId?: DomainId | null;
	readonly summary?: string | null;
	readonly requestedByProfileId?: DomainId | null;
	readonly requestedAt?: Date | null;
}

export type UpdateRequestedControlActionDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateRequestedControlActionDetails',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly changes: Readonly<{
			readonly controlType?: ControlType;
			readonly recommendedMethodId?: DomainId | null;
			readonly summary?: string | null;
			readonly requestedByProfileId?: DomainId | null;
			readonly requestedAt?: Date | null;
		}>;
	}
>;

export interface UpdateRequestedControlActionLocationAndContextCommandInput
	extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
}

export type UpdateRequestedControlActionLocationAndContextCommand =
	ControlOperationsDomainCommand<
		'controlOperations.updateRequestedControlActionLocationAndContext',
		ControlCommandPayload & {
			readonly requestedControlActionId: DomainId;
			readonly changes: Readonly<{
				readonly featureId?: DomainId;
				readonly addressId?: DomainId | null;
				readonly context?: ControlActionContext;
			}>;
		}
	>;

export interface ResolveRequestedControlActionCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly resolvedAt?: Date | null;
}

export type ResolveRequestedControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.resolveRequestedControlAction',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly resolvedAt: Date | null;
	}
>;

export interface RequestedControlActionIdCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
}

export type ReopenRequestedControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.reopenRequestedControlAction',
	ControlCommandPayload & { readonly requestedControlActionId: DomainId }
>;

export interface DeleteRequestedControlActionCommandInput
	extends RequestedControlActionIdCommandInput {
	readonly acknowledgedActionDetach?: boolean;
	readonly acknowledgedMissionDetach?: boolean;
}

export type DeleteRequestedControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteRequestedControlAction',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly acknowledgedActionDetach: boolean;
		readonly acknowledgedMissionDetach: boolean;
	}
>;

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

export interface FormulationComponentAmountInput {
	readonly insecticideId: DomainId;
	readonly ratio: number;
}

export interface CalculateFormulationComponentAmountsInput {
	readonly totalAmount: number;
	readonly diluentRatio?: number;
	readonly components: readonly FormulationComponentAmountInput[];
}

export interface FormulationComponentAmount {
	readonly insecticideId: DomainId;
	readonly amount: number;
	readonly ratio: number;
}

export interface FormulationExpansionComponentInput extends FormulationComponentAmountInput {
	readonly applicationId: DomainId;
	readonly applicationUnitId: DomainId;
	readonly applicationBatches?: readonly ApplicationBatchInput[];
}

export interface ExpandFormulationApplicationCommandsInput extends ControlCommandInput {
	readonly totalAmount: number;
	readonly diluentRatio?: number;
	readonly components: readonly FormulationExpansionComponentInput[];
	readonly applicationDate: LocalDateString;
	readonly applicatorProfileId?: DomainId | null;
	readonly featureId: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
	readonly applicationMethodId?: DomainId | null;
	readonly vehicleId?: DomainId | null;
	readonly equipmentId?: DomainId | null;
	readonly metadata?: unknown | null;
}

const CONTROL_TYPES = ['application', 'source_reduction', 'biocontrol', 'outreach'] as const;
const INSECTICIDE_TYPES = ['larvicide', 'adulticide', 'pupicide', 'other'] as const;
const SOURCE_REDUCTION_UNIT_TYPES = ['count', 'distance', 'area', 'volume'] as const;
const BIOCONTROL_UNIT_TYPES = ['count', 'volume', 'weight'] as const;

export function createApplicationMethodCommand(
	input: CreateApplicationMethodCommandInput,
): CreateApplicationMethodCommand {
	return createMethodCommand(
		'controlOperations.createApplicationMethod',
		input,
		'applicationMethodId',
	);
}

export function updateApplicationMethodCommand(
	input: UpdateApplicationMethodCommandInput,
): UpdateApplicationMethodCommand {
	return updateMethodCommand(
		'controlOperations.updateApplicationMethod',
		input,
		'applicationMethodId',
	);
}

export function deactivateApplicationMethodCommand(
	input: ApplicationMethodIdCommandInput,
): DeactivateApplicationMethodCommand {
	return idCommand('controlOperations.deactivateApplicationMethod', input, 'applicationMethodId');
}

export function reactivateApplicationMethodCommand(
	input: ApplicationMethodIdCommandInput,
): ReactivateApplicationMethodCommand {
	return idCommand('controlOperations.reactivateApplicationMethod', input, 'applicationMethodId');
}

export function deleteApplicationMethodCommand(
	input: ApplicationMethodIdCommandInput,
): DeleteApplicationMethodCommand {
	return idCommand('controlOperations.deleteApplicationMethod', input, 'applicationMethodId');
}

export function createSourceReductionMethodCommand(
	input: CreateSourceReductionMethodCommandInput,
): CreateSourceReductionMethodCommand {
	return createMethodCommand(
		'controlOperations.createSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function updateSourceReductionMethodCommand(
	input: UpdateSourceReductionMethodCommandInput,
): UpdateSourceReductionMethodCommand {
	return updateMethodCommand(
		'controlOperations.updateSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function deactivateSourceReductionMethodCommand(
	input: SourceReductionMethodIdCommandInput,
): DeactivateSourceReductionMethodCommand {
	return idCommand(
		'controlOperations.deactivateSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function reactivateSourceReductionMethodCommand(
	input: SourceReductionMethodIdCommandInput,
): ReactivateSourceReductionMethodCommand {
	return idCommand(
		'controlOperations.reactivateSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function deleteSourceReductionMethodCommand(
	input: SourceReductionMethodIdCommandInput,
): DeleteSourceReductionMethodCommand {
	return idCommand(
		'controlOperations.deleteSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function createOutreachMethodCommand(
	input: CreateOutreachMethodCommandInput,
): CreateOutreachMethodCommand {
	return createMethodCommand('controlOperations.createOutreachMethod', input, 'outreachMethodId');
}

export function updateOutreachMethodCommand(
	input: UpdateOutreachMethodCommandInput,
): UpdateOutreachMethodCommand {
	return updateMethodCommand('controlOperations.updateOutreachMethod', input, 'outreachMethodId');
}

export function deactivateOutreachMethodCommand(
	input: OutreachMethodIdCommandInput,
): DeactivateOutreachMethodCommand {
	return idCommand('controlOperations.deactivateOutreachMethod', input, 'outreachMethodId');
}

export function reactivateOutreachMethodCommand(
	input: OutreachMethodIdCommandInput,
): ReactivateOutreachMethodCommand {
	return idCommand('controlOperations.reactivateOutreachMethod', input, 'outreachMethodId');
}

export function deleteOutreachMethodCommand(
	input: OutreachMethodIdCommandInput,
): DeleteOutreachMethodCommand {
	return idCommand('controlOperations.deleteOutreachMethod', input, 'outreachMethodId');
}

export function createBiocontrolMethodCommand(
	input: CreateBiocontrolMethodCommandInput,
): CreateBiocontrolMethodCommand {
	return createMethodCommand(
		'controlOperations.createBiocontrolMethod',
		input,
		'biocontrolMethodId',
	);
}

export function updateBiocontrolMethodCommand(
	input: UpdateBiocontrolMethodCommandInput,
): UpdateBiocontrolMethodCommand {
	return updateMethodCommand(
		'controlOperations.updateBiocontrolMethod',
		input,
		'biocontrolMethodId',
	);
}

export function deactivateBiocontrolMethodCommand(
	input: BiocontrolMethodIdCommandInput,
): DeactivateBiocontrolMethodCommand {
	return idCommand('controlOperations.deactivateBiocontrolMethod', input, 'biocontrolMethodId');
}

export function reactivateBiocontrolMethodCommand(
	input: BiocontrolMethodIdCommandInput,
): ReactivateBiocontrolMethodCommand {
	return idCommand('controlOperations.reactivateBiocontrolMethod', input, 'biocontrolMethodId');
}

export function deleteBiocontrolMethodCommand(
	input: BiocontrolMethodIdCommandInput,
): DeleteBiocontrolMethodCommand {
	return idCommand('controlOperations.deleteBiocontrolMethod', input, 'biocontrolMethodId');
}

export function createVehicleCommand(input: CreateVehicleCommandInput): CreateVehicleCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.vehicleId, 'vehicleId', issues);
	const vehicleName = normalizeRequiredText(input.vehicleName, 'vehicleName', issues, 200);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create vehicle command is invalid.', issues);
	return {
		type: 'controlOperations.createVehicle',
		payload: {
			...basePayload(input),
			vehicleId: normalizeRequiredId(input.vehicleId),
			vehicleName,
			metadata,
		},
	};
}

export function updateVehicleCommand(input: UpdateVehicleCommandInput): UpdateVehicleCommand {
	const issues = validateIdCommand(input, 'vehicleId');
	const hasName = input.vehicleName !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasName && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one vehicle field must change.' });
	}
	const vehicleName = hasName
		? normalizeRequiredText(input.vehicleName, 'vehicleName', issues, 200)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update vehicle command is invalid.', issues);
	return {
		type: 'controlOperations.updateVehicle',
		payload: {
			...basePayload(input),
			vehicleId: normalizeRequiredId(input.vehicleId),
			changes: {
				...(vehicleName !== undefined ? { vehicleName } : {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
			acknowledgedHistoricalVehicleLabelChange:
				input.acknowledgedHistoricalVehicleLabelChange ?? false,
		},
	};
}

export function deactivateVehicleCommand(input: VehicleIdCommandInput): DeactivateVehicleCommand {
	return idCommand('controlOperations.deactivateVehicle', input, 'vehicleId');
}

export function reactivateVehicleCommand(input: VehicleIdCommandInput): ReactivateVehicleCommand {
	return idCommand('controlOperations.reactivateVehicle', input, 'vehicleId');
}

export function deleteVehicleCommand(input: VehicleIdCommandInput): DeleteVehicleCommand {
	return idCommand('controlOperations.deleteVehicle', input, 'vehicleId');
}

export function createEquipmentCommand(input: CreateEquipmentCommandInput): CreateEquipmentCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.equipmentId, 'equipmentId', issues);
	const equipmentName = normalizeRequiredText(input.equipmentName, 'equipmentName', issues, 200);
	const serialNumber = normalizeNullableText(input.serialNumber, 'serialNumber', issues, 500);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create equipment command is invalid.', issues);
	return {
		type: 'controlOperations.createEquipment',
		payload: {
			...basePayload(input),
			equipmentId: normalizeRequiredId(input.equipmentId),
			equipmentName,
			serialNumber,
			metadata,
		},
	};
}

export function updateEquipmentCommand(
	input: UpdateEquipmentCommandInput,
): UpdateEquipmentCommand {
	const issues = validateIdCommand(input, 'equipmentId');
	const hasName = input.equipmentName !== undefined;
	const hasSerial = input.serialNumber !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasName && !hasSerial && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one equipment field must change.' });
	}
	const equipmentName = hasName
		? normalizeRequiredText(input.equipmentName, 'equipmentName', issues, 200)
		: undefined;
	const serialNumber = hasSerial
		? normalizeNullableText(input.serialNumber, 'serialNumber', issues, 500)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update equipment command is invalid.', issues);
	return {
		type: 'controlOperations.updateEquipment',
		payload: {
			...basePayload(input),
			equipmentId: normalizeRequiredId(input.equipmentId),
			changes: {
				...(equipmentName !== undefined ? { equipmentName } : {}),
				...(hasSerial ? { serialNumber: serialNumber ?? null } : {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
			acknowledgedHistoricalEquipmentLabelChange:
				input.acknowledgedHistoricalEquipmentLabelChange ?? false,
		},
	};
}

export function deactivateEquipmentCommand(
	input: EquipmentIdCommandInput,
): DeactivateEquipmentCommand {
	return idCommand('controlOperations.deactivateEquipment', input, 'equipmentId');
}

export function reactivateEquipmentCommand(
	input: EquipmentIdCommandInput,
): ReactivateEquipmentCommand {
	return idCommand('controlOperations.reactivateEquipment', input, 'equipmentId');
}

export function deleteEquipmentCommand(input: EquipmentIdCommandInput): DeleteEquipmentCommand {
	return idCommand('controlOperations.deleteEquipment', input, 'equipmentId');
}

export function createInsecticideCommand(
	input: CreateInsecticideCommandInput,
): CreateInsecticideCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	requireUuid(input.defaultUnitId, 'defaultUnitId', issues);
	const type = normalizeStringUnion(input.type, INSECTICIDE_TYPES, 'type', issues);
	const tradeName = normalizeRequiredText(input.tradeName, 'tradeName', issues, 200);
	const activeIngredient = normalizeRequiredText(
		input.activeIngredient,
		'activeIngredient',
		issues,
		500,
	);
	const registrationNumber = normalizeRequiredText(
		input.registrationNumber,
		'registrationNumber',
		issues,
		500,
	);
	const labelUrl = normalizeNullableUrl(input.labelUrl, 'labelUrl', issues);
	const msdsUrl = normalizeNullableUrl(input.msdsUrl, 'msdsUrl', issues);
	const shorthand = normalizeNullableText(input.shorthand, 'shorthand', issues, 200);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.createInsecticide',
		payload: {
			...basePayload(input),
			insecticideId: normalizeRequiredId(input.insecticideId),
			tradeName,
			activeIngredient,
			type,
			registrationNumber,
			defaultUnitId: normalizeRequiredId(input.defaultUnitId),
			labelUrl,
			msdsUrl,
			shorthand,
			metadata,
		},
	};
}

export function updateInsecticideCommand(
	input: UpdateInsecticideCommandInput,
): UpdateInsecticideCommand {
	const issues = validateIdCommand(input, 'insecticideId');
	const hasTradeName = input.tradeName !== undefined;
	const hasActiveIngredient = input.activeIngredient !== undefined;
	const hasType = input.type !== undefined;
	const hasRegistrationNumber = input.registrationNumber !== undefined;
	const hasDefaultUnit = input.defaultUnitId !== undefined;
	const hasLabelUrl = input.labelUrl !== undefined;
	const hasMsdsUrl = input.msdsUrl !== undefined;
	const hasShorthand = input.shorthand !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (
		!hasTradeName &&
		!hasActiveIngredient &&
		!hasType &&
		!hasRegistrationNumber &&
		!hasDefaultUnit &&
		!hasLabelUrl &&
		!hasMsdsUrl &&
		!hasShorthand &&
		!hasMetadata
	) {
		issues.push({ path: 'changes', message: 'At least one insecticide field must change.' });
	}
	if (hasDefaultUnit) {
		requireUuid(input.defaultUnitId, 'defaultUnitId', issues);
	}
	const type = hasType
		? normalizeStringUnion(input.type, INSECTICIDE_TYPES, 'type', issues)
		: undefined;
	const tradeName = hasTradeName
		? normalizeRequiredText(input.tradeName, 'tradeName', issues, 200)
		: undefined;
	const activeIngredient = hasActiveIngredient
		? normalizeRequiredText(input.activeIngredient, 'activeIngredient', issues, 500)
		: undefined;
	const registrationNumber = hasRegistrationNumber
		? normalizeRequiredText(input.registrationNumber, 'registrationNumber', issues, 500)
		: undefined;
	const labelUrl = hasLabelUrl ? normalizeNullableUrl(input.labelUrl, 'labelUrl', issues) : undefined;
	const msdsUrl = hasMsdsUrl ? normalizeNullableUrl(input.msdsUrl, 'msdsUrl', issues) : undefined;
	const shorthand = hasShorthand
		? normalizeNullableText(input.shorthand, 'shorthand', issues, 200)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.updateInsecticide',
		payload: {
			...basePayload(input),
			insecticideId: normalizeRequiredId(input.insecticideId),
			changes: {
				...(tradeName !== undefined ? { tradeName } : {}),
				...(activeIngredient !== undefined ? { activeIngredient } : {}),
				...(type !== undefined ? { type } : {}),
				...(registrationNumber !== undefined ? { registrationNumber } : {}),
				...(hasDefaultUnit ? { defaultUnitId: normalizeRequiredId(input.defaultUnitId) } : {}),
				...(hasLabelUrl ? { labelUrl: labelUrl ?? null } : {}),
				...(hasMsdsUrl ? { msdsUrl: msdsUrl ?? null } : {}),
				...(hasShorthand ? { shorthand: shorthand ?? null } : {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
			acknowledgedHistoricalProductChange: input.acknowledgedHistoricalProductChange ?? false,
		},
	};
}

export function deactivateInsecticideCommand(
	input: DeactivateInsecticideCommandInput,
): DeactivateInsecticideCommand {
	const issues = validateIdCommand(input, 'insecticideId');
	throwIfIssues('Deactivate insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.deactivateInsecticide',
		payload: {
			...basePayload(input),
			insecticideId: normalizeRequiredId(input.insecticideId),
			acknowledgedDependentDeactivation: input.acknowledgedDependentDeactivation ?? false,
		},
	};
}

export function reactivateInsecticideCommand(
	input: InsecticideIdCommandInput,
): ReactivateInsecticideCommand {
	return idCommand('controlOperations.reactivateInsecticide', input, 'insecticideId');
}

export function deleteInsecticideCommand(input: InsecticideIdCommandInput): DeleteInsecticideCommand {
	return idCommand('controlOperations.deleteInsecticide', input, 'insecticideId');
}

export function createInsecticideBatchCommand(
	input: CreateInsecticideBatchCommandInput,
): CreateInsecticideBatchCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.insecticideBatchId, 'insecticideBatchId', issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	const batchName = normalizeRequiredText(input.batchName, 'batchName', issues, 200);
	throwIfIssues('Create insecticide batch command is invalid.', issues);
	return {
		type: 'controlOperations.createInsecticideBatch',
		payload: {
			...basePayload(input),
			insecticideBatchId: normalizeRequiredId(input.insecticideBatchId),
			insecticideId: normalizeRequiredId(input.insecticideId),
			batchName,
		},
	};
}

export function updateInsecticideBatchCommand(
	input: UpdateInsecticideBatchCommandInput,
): UpdateInsecticideBatchCommand {
	const issues = validateIdCommand(input, 'insecticideBatchId');
	const hasName = input.batchName !== undefined;
	if (!hasName) {
		issues.push({ path: 'changes', message: 'At least one insecticide batch field must change.' });
	}
	const batchName = hasName
		? normalizeRequiredText(input.batchName, 'batchName', issues, 200)
		: undefined;
	throwIfIssues('Update insecticide batch command is invalid.', issues);
	return {
		type: 'controlOperations.updateInsecticideBatch',
		payload: {
			...basePayload(input),
			insecticideBatchId: normalizeRequiredId(input.insecticideBatchId),
			changes: {
				...(batchName !== undefined ? { batchName } : {}),
			},
			acknowledgedHistoricalBatchLabelChange:
				input.acknowledgedHistoricalBatchLabelChange ?? false,
		},
	};
}

export function deactivateInsecticideBatchCommand(
	input: InsecticideBatchIdCommandInput,
): DeactivateInsecticideBatchCommand {
	return idCommand('controlOperations.deactivateInsecticideBatch', input, 'insecticideBatchId');
}

export function reactivateInsecticideBatchCommand(
	input: InsecticideBatchIdCommandInput,
): ReactivateInsecticideBatchCommand {
	return idCommand('controlOperations.reactivateInsecticideBatch', input, 'insecticideBatchId');
}

export function deleteInsecticideBatchCommand(
	input: InsecticideBatchIdCommandInput,
): DeleteInsecticideBatchCommand {
	return idCommand('controlOperations.deleteInsecticideBatch', input, 'insecticideBatchId');
}

export function createFormulationCommand(
	input: CreateFormulationCommandInput,
): CreateFormulationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.formulationId, 'formulationId', issues);
	const formulationName = normalizeRequiredText(
		input.formulationName,
		'formulationName',
		issues,
		200,
	);
	const description = normalizeNullableText(input.description, 'description', issues, 2_000);
	const diluentRatio = normalizeNonnegativeFiniteNumber(
		input.diluentRatio ?? 0,
		'diluentRatio',
		issues,
	);
	throwIfIssues('Create formulation command is invalid.', issues);
	return {
		type: 'controlOperations.createFormulation',
		payload: {
			...basePayload(input),
			formulationId: normalizeRequiredId(input.formulationId),
			formulationName,
			description,
			diluentRatio,
		},
	};
}

export function updateFormulationDetailsCommand(
	input: UpdateFormulationDetailsCommandInput,
): UpdateFormulationDetailsCommand {
	const issues = validateIdCommand(input, 'formulationId');
	const hasName = input.formulationName !== undefined;
	const hasDescription = input.description !== undefined;
	const hasDiluent = input.diluentRatio !== undefined;
	if (!hasName && !hasDescription && !hasDiluent) {
		issues.push({ path: 'changes', message: 'At least one formulation field must change.' });
	}
	const formulationName = hasName
		? normalizeRequiredText(input.formulationName, 'formulationName', issues, 200)
		: undefined;
	const description = hasDescription
		? normalizeNullableText(input.description, 'description', issues, 2_000)
		: undefined;
	const diluentRatio = hasDiluent
		? normalizeNonnegativeFiniteNumber(input.diluentRatio, 'diluentRatio', issues)
		: undefined;
	throwIfIssues('Update formulation details command is invalid.', issues);
	return {
		type: 'controlOperations.updateFormulationDetails',
		payload: {
			...basePayload(input),
			formulationId: normalizeRequiredId(input.formulationId),
			changes: {
				...(formulationName !== undefined ? { formulationName } : {}),
				...(hasDescription ? { description: description ?? null } : {}),
				...(diluentRatio !== undefined ? { diluentRatio } : {}),
			},
		},
	};
}

export function activateFormulationCommand(
	input: FormulationIdCommandInput,
): ActivateFormulationCommand {
	return idCommand('controlOperations.activateFormulation', input, 'formulationId');
}

export function deactivateFormulationCommand(
	input: FormulationIdCommandInput,
): DeactivateFormulationCommand {
	return idCommand('controlOperations.deactivateFormulation', input, 'formulationId');
}

export function deleteFormulationCommand(
	input: DeleteFormulationCommandInput,
): DeleteFormulationCommand {
	const issues = validateIdCommand(input, 'formulationId');
	throwIfIssues('Delete formulation command is invalid.', issues);
	return {
		type: 'controlOperations.deleteFormulation',
		payload: {
			...basePayload(input),
			formulationId: normalizeRequiredId(input.formulationId),
			acknowledgedComponentDeletion: input.acknowledgedComponentDeletion ?? false,
		},
	};
}

export function addFormulationInsecticideCommand(
	input: AddFormulationInsecticideCommandInput,
): AddFormulationInsecticideCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.formulationInsecticideId, 'formulationInsecticideId', issues);
	requireUuid(input.formulationId, 'formulationId', issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	const ratio = normalizePositiveFiniteNumber(input.ratio, 'ratio', issues);
	throwIfIssues('Add formulation insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.addFormulationInsecticide',
		payload: {
			...basePayload(input),
			formulationInsecticideId: normalizeRequiredId(input.formulationInsecticideId),
			formulationId: normalizeRequiredId(input.formulationId),
			insecticideId: normalizeRequiredId(input.insecticideId),
			ratio,
		},
	};
}

export function updateFormulationInsecticideCommand(
	input: UpdateFormulationInsecticideCommandInput,
): UpdateFormulationInsecticideCommand {
	const issues = validateIdCommand(input, 'formulationInsecticideId');
	const hasInsecticide = input.insecticideId !== undefined;
	const hasRatio = input.ratio !== undefined;
	if (!hasInsecticide && !hasRatio) {
		issues.push({ path: 'changes', message: 'At least one formulation component field must change.' });
	}
	if (hasInsecticide) {
		requireUuid(input.insecticideId, 'insecticideId', issues);
	}
	const ratio = hasRatio ? normalizePositiveFiniteNumber(input.ratio, 'ratio', issues) : undefined;
	throwIfIssues('Update formulation insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.updateFormulationInsecticide',
		payload: {
			...basePayload(input),
			formulationInsecticideId: normalizeRequiredId(input.formulationInsecticideId),
			changes: {
				...(hasInsecticide ? { insecticideId: normalizeRequiredId(input.insecticideId) } : {}),
				...(ratio !== undefined ? { ratio } : {}),
			},
			acknowledgedDeactivateEmptyFormulation:
				input.acknowledgedDeactivateEmptyFormulation ?? false,
		},
	};
}

export function removeFormulationInsecticideCommand(
	input: RemoveFormulationInsecticideCommandInput,
): RemoveFormulationInsecticideCommand {
	const issues = validateIdCommand(input, 'formulationInsecticideId');
	throwIfIssues('Remove formulation insecticide command is invalid.', issues);
	return {
		type: 'controlOperations.removeFormulationInsecticide',
		payload: {
			...basePayload(input),
			formulationInsecticideId: normalizeRequiredId(input.formulationInsecticideId),
			acknowledgedDeactivateEmptyFormulation:
				input.acknowledgedDeactivateEmptyFormulation ?? false,
		},
	};
}

export function recordChemicalApplicationCommand(
	input: RecordChemicalApplicationCommandInput,
): RecordChemicalApplicationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.applicationId, 'applicationId', issues);
	requireUuid(input.insecticideId, 'insecticideId', issues);
	requireUuid(input.applicationUnitId, 'applicationUnitId', issues);
	validateLocalDate(input.applicationDate, 'applicationDate', issues);
	requireUuid(input.featureId, 'featureId', issues);
	const applicationBatches = validateApplicationBatches(input.applicationBatches ?? [], issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const context = validateContext(input.context ?? { kind: 'none' }, 'chemicalApplication', issues);
	const amountApplied = normalizePositiveFiniteNumber(input.amountApplied, 'amountApplied', issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const requestedControlActionId = normalizeOptionalUuid(
		input.requestedControlActionId,
		'requestedControlActionId',
		issues,
	);
	const applicationMethodId = normalizeOptionalUuid(
		input.applicationMethodId,
		'applicationMethodId',
		issues,
	);
	const vehicleId = normalizeOptionalUuid(input.vehicleId, 'vehicleId', issues);
	const equipmentId = normalizeOptionalUuid(input.equipmentId, 'equipmentId', issues);
	throwIfIssues('Record chemical application command is invalid.', issues);
	return {
		type: 'controlOperations.recordChemicalApplication',
		payload: {
			...basePayload(input),
			applicationId: normalizeRequiredId(input.applicationId),
			insecticideId: normalizeRequiredId(input.insecticideId),
			amountApplied,
			applicationUnitId: normalizeRequiredId(input.applicationUnitId),
			applicationDate: input.applicationDate,
			applicatorProfileId: normalizeActorDefaultProfileId(
				input.applicatorProfileId,
				input.actorProfileId,
			),
			featureId: normalizeRequiredId(input.featureId),
			addressId,
			context,
			requestedControlActionId,
			applicationMethodId,
			vehicleId,
			equipmentId,
			applicationBatches,
			metadata,
		},
	};
}

export function updateChemicalApplicationFieldDetailsCommand(
	input: UpdateChemicalApplicationFieldDetailsCommandInput,
): UpdateChemicalApplicationFieldDetailsCommand {
	const issues = validateIdCommand(input, 'applicationId');
	const hasDate = input.applicationDate !== undefined;
	const hasApplicator = input.applicatorProfileId !== undefined;
	const hasMethod = input.applicationMethodId !== undefined;
	const hasInsecticide = input.insecticideId !== undefined;
	const hasAmount = input.amountApplied !== undefined;
	const hasUnit = input.applicationUnitId !== undefined;
	const hasVehicle = input.vehicleId !== undefined;
	const hasEquipment = input.equipmentId !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (
		!hasDate &&
		!hasApplicator &&
		!hasMethod &&
		!hasInsecticide &&
		!hasAmount &&
		!hasUnit &&
		!hasVehicle &&
		!hasEquipment &&
		!hasMetadata
	) {
		issues.push({ path: 'changes', message: 'At least one chemical application field must change.' });
	}
	if (hasDate) {
		validateLocalDate(input.applicationDate, 'applicationDate', issues);
	}
	if (hasInsecticide) {
		requireUuid(input.insecticideId, 'insecticideId', issues);
	}
	if (hasUnit) {
		requireUuid(input.applicationUnitId, 'applicationUnitId', issues);
	}
	const amount = hasAmount
		? normalizePositiveFiniteNumber(input.amountApplied, 'amountApplied', issues)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	throwIfIssues('Update chemical application field details command is invalid.', issues);
	return {
		type: 'controlOperations.updateChemicalApplicationFieldDetails',
		payload: {
			...basePayload(input),
			applicationId: normalizeRequiredId(input.applicationId),
			changes: {
				...(hasDate ? { applicationDate: input.applicationDate } : {}),
				...(hasApplicator
					? {
							applicatorProfileId: normalizeOptionalUuid(
								input.applicatorProfileId,
								'applicatorProfileId',
								issues,
							),
						}
					: {}),
				...(hasMethod
					? {
							applicationMethodId: normalizeOptionalUuid(
								input.applicationMethodId,
								'applicationMethodId',
								issues,
							),
						}
					: {}),
				...(hasInsecticide ? { insecticideId: normalizeRequiredId(input.insecticideId) } : {}),
				...(amount !== undefined ? { amountApplied: amount } : {}),
				...(hasUnit ? { applicationUnitId: normalizeRequiredId(input.applicationUnitId) } : {}),
				...(hasVehicle
					? { vehicleId: normalizeOptionalUuid(input.vehicleId, 'vehicleId', issues) }
					: {}),
				...(hasEquipment
					? { equipmentId: normalizeOptionalUuid(input.equipmentId, 'equipmentId', issues) }
					: {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
			acknowledgedBatchClearance: input.acknowledgedBatchClearance ?? false,
		},
	};
}

export function updateChemicalApplicationLocationAndContextCommand(
	input: UpdateChemicalApplicationLocationAndContextCommandInput,
): UpdateChemicalApplicationLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'applicationId');
	const context = input.context
		? validateContext(input.context, 'chemicalApplication', issues)
		: undefined;
	throwIfIssues('Update chemical application location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateChemicalApplicationLocationAndContext',
		payload: {
			...basePayload(input),
			applicationId: normalizeRequiredId(input.applicationId),
			changes: locationContextChanges(input, context, issues),
		},
	};
}

export function deleteChemicalApplicationCommand(
	input: DeleteChemicalApplicationCommandInput,
): DeleteChemicalApplicationCommand {
	const issues = validateIdCommand(input, 'applicationId');
	throwIfIssues('Delete chemical application command is invalid.', issues);
	return {
		type: 'controlOperations.deleteChemicalApplication',
		payload: {
			...basePayload(input),
			applicationId: normalizeRequiredId(input.applicationId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
			acknowledgedBatchDeletion: input.acknowledgedBatchDeletion ?? false,
		},
	};
}

export function addChemicalApplicationBatchCommand(
	input: AddChemicalApplicationBatchCommandInput,
): AddChemicalApplicationBatchCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.applicationBatchId, 'applicationBatchId', issues);
	requireUuid(input.applicationId, 'applicationId', issues);
	requireUuid(input.insecticideBatchId, 'insecticideBatchId', issues);
	throwIfIssues('Add chemical application batch command is invalid.', issues);
	return {
		type: 'controlOperations.addChemicalApplicationBatch',
		payload: {
			...basePayload(input),
			applicationBatchId: normalizeRequiredId(input.applicationBatchId),
			applicationId: normalizeRequiredId(input.applicationId),
			insecticideBatchId: normalizeRequiredId(input.insecticideBatchId),
		},
	};
}

export function removeChemicalApplicationBatchCommand(
	input: RemoveChemicalApplicationBatchCommandInput,
): RemoveChemicalApplicationBatchCommand {
	return idCommand('controlOperations.removeChemicalApplicationBatch', input, 'applicationBatchId');
}

export function recordSourceReductionCommand(
	input: RecordSourceReductionCommandInput,
): RecordSourceReductionCommand {
	const issues = createIssues();
	validateActionBase(input, issues);
	requireUuid(input.sourceReductionId, 'sourceReductionId', issues);
	requireUuid(input.sourceReductionMethodId, 'sourceReductionMethodId', issues);
	validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	requireUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	const context = validateContext(input.context ?? { kind: 'none' }, 'sourceReduction', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const sourcesEliminatedAmount = normalizePositiveFiniteNumber(
		input.sourcesEliminatedAmount,
		'sourcesEliminatedAmount',
		issues,
	);
	throwIfIssues('Record source reduction command is invalid.', issues);
	return {
		type: 'controlOperations.recordSourceReduction',
		payload: {
			...actionBasePayload(input, metadata, issues),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			sourceReductionMethodId: normalizeRequiredId(input.sourceReductionMethodId),
			technicianProfileId: normalizeActorDefaultProfileId(
				input.technicianProfileId,
				input.actorProfileId,
			),
			sourceReductionDate: input.sourceReductionDate,
			context,
			sourcesEliminatedAmount,
			sourcesEliminatedUnitId: normalizeRequiredId(input.sourcesEliminatedUnitId),
		},
	};
}

export function updateSourceReductionFieldDetailsCommand(
	input: UpdateSourceReductionFieldDetailsCommandInput,
): UpdateSourceReductionFieldDetailsCommand {
	const issues = validateIdCommand(input, 'sourceReductionId');
	const changes = sourceReductionFieldChanges(input, issues);
	throwIfIssues('Update source reduction field details command is invalid.', issues);
	return {
		type: 'controlOperations.updateSourceReductionFieldDetails',
		payload: {
			...basePayload(input),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			changes,
		},
	};
}

export function updateSourceReductionLocationAndContextCommand(
	input: UpdateSourceReductionLocationAndContextCommandInput,
): UpdateSourceReductionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'sourceReductionId');
	const context = input.context ? validateContext(input.context, 'sourceReduction', issues) : undefined;
	throwIfIssues('Update source reduction location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateSourceReductionLocationAndContext',
		payload: {
			...basePayload(input),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			changes: locationContextChanges(input, context, issues),
		},
	};
}

export function deleteSourceReductionCommand(
	input: DeleteSourceReductionCommandInput,
): DeleteSourceReductionCommand {
	const issues = validateIdCommand(input, 'sourceReductionId');
	throwIfIssues('Delete source reduction command is invalid.', issues);
	return {
		type: 'controlOperations.deleteSourceReduction',
		payload: {
			...basePayload(input),
			sourceReductionId: normalizeRequiredId(input.sourceReductionId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
		},
	};
}

export function recordOutreachActionCommand(
	input: RecordOutreachActionCommandInput,
): RecordOutreachActionCommand {
	const issues = createIssues();
	validateActionBase(input, issues);
	requireUuid(input.outreachActionId, 'outreachActionId', issues);
	requireUuid(input.outreachMethodId, 'outreachMethodId', issues);
	validateLocalDate(input.outreachDate, 'outreachDate', issues);
	const context = validateContext(input.context ?? { kind: 'none' }, 'outreach', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const reach = normalizePositiveInteger(input.reach, 'reach', issues);
	const reachDescription = normalizeNullableText(
		input.reachDescription,
		'reachDescription',
		issues,
		2_000,
	);
	throwIfIssues('Record outreach action command is invalid.', issues);
	return {
		type: 'controlOperations.recordOutreachAction',
		payload: {
			...actionBasePayload(input, metadata, issues),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			outreachMethodId: normalizeRequiredId(input.outreachMethodId),
			technicianProfileId: normalizeActorDefaultProfileId(
				input.technicianProfileId,
				input.actorProfileId,
			),
			outreachDate: input.outreachDate,
			context,
			reach,
			reachDescription,
		},
	};
}

export function updateOutreachActionFieldDetailsCommand(
	input: UpdateOutreachActionFieldDetailsCommandInput,
): UpdateOutreachActionFieldDetailsCommand {
	const issues = validateIdCommand(input, 'outreachActionId');
	const changes = outreachFieldChanges(input, issues);
	throwIfIssues('Update outreach action field details command is invalid.', issues);
	return {
		type: 'controlOperations.updateOutreachActionFieldDetails',
		payload: {
			...basePayload(input),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			changes,
		},
	};
}

export function updateOutreachActionLocationAndContextCommand(
	input: UpdateOutreachActionLocationAndContextCommandInput,
): UpdateOutreachActionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'outreachActionId');
	const context = input.context ? validateContext(input.context, 'outreach', issues) : undefined;
	throwIfIssues('Update outreach action location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateOutreachActionLocationAndContext',
		payload: {
			...basePayload(input),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			changes: locationContextChanges(input, context, issues),
		},
	};
}

export function deleteOutreachActionCommand(
	input: DeleteOutreachActionCommandInput,
): DeleteOutreachActionCommand {
	const issues = validateIdCommand(input, 'outreachActionId');
	throwIfIssues('Delete outreach action command is invalid.', issues);
	return {
		type: 'controlOperations.deleteOutreachAction',
		payload: {
			...basePayload(input),
			outreachActionId: normalizeRequiredId(input.outreachActionId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
		},
	};
}

export function recordBiocontrolActionCommand(
	input: RecordBiocontrolActionCommandInput,
): RecordBiocontrolActionCommand {
	const issues = createIssues();
	validateActionBase(input, issues);
	requireUuid(input.biocontrolActionId, 'biocontrolActionId', issues);
	requireUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues);
	validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	requireUuid(input.releaseUnitId, 'releaseUnitId', issues);
	const context = validateContext(input.context ?? { kind: 'none' }, 'biocontrol', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	const amountReleased = normalizePositiveFiniteNumber(
		input.amountReleased,
		'amountReleased',
		issues,
	);
	throwIfIssues('Record biocontrol action command is invalid.', issues);
	return {
		type: 'controlOperations.recordBiocontrolAction',
		payload: {
			...actionBasePayload(input, metadata, issues),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			biocontrolMethodId: normalizeRequiredId(input.biocontrolMethodId),
			technicianProfileId: normalizeActorDefaultProfileId(
				input.technicianProfileId,
				input.actorProfileId,
			),
			biocontrolDate: input.biocontrolDate,
			context,
			amountReleased,
			releaseUnitId: normalizeRequiredId(input.releaseUnitId),
		},
	};
}

export function updateBiocontrolActionFieldDetailsCommand(
	input: UpdateBiocontrolActionFieldDetailsCommandInput,
): UpdateBiocontrolActionFieldDetailsCommand {
	const issues = validateIdCommand(input, 'biocontrolActionId');
	const changes = biocontrolFieldChanges(input, issues);
	throwIfIssues('Update biocontrol action field details command is invalid.', issues);
	return {
		type: 'controlOperations.updateBiocontrolActionFieldDetails',
		payload: {
			...basePayload(input),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			changes,
		},
	};
}

export function updateBiocontrolActionLocationAndContextCommand(
	input: UpdateBiocontrolActionLocationAndContextCommandInput,
): UpdateBiocontrolActionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'biocontrolActionId');
	const context = input.context ? validateContext(input.context, 'biocontrol', issues) : undefined;
	throwIfIssues('Update biocontrol action location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateBiocontrolActionLocationAndContext',
		payload: {
			...basePayload(input),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			changes: locationContextChanges(input, context, issues),
		},
	};
}

export function deleteBiocontrolActionCommand(
	input: DeleteBiocontrolActionCommandInput,
): DeleteBiocontrolActionCommand {
	const issues = validateIdCommand(input, 'biocontrolActionId');
	throwIfIssues('Delete biocontrol action command is invalid.', issues);
	return {
		type: 'controlOperations.deleteBiocontrolAction',
		payload: {
			...basePayload(input),
			biocontrolActionId: normalizeRequiredId(input.biocontrolActionId),
			acknowledgedSupportRecordDeletion: input.acknowledgedSupportRecordDeletion ?? false,
		},
	};
}

export function requestControlActionCommand(
	input: RequestControlActionCommandInput,
): RequestControlActionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	requireUuid(input.featureId, 'featureId', issues);
	const controlType = normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues);
	const context = validateContext(input.context ?? { kind: 'none' }, controlType, issues);
	const requestedAt = normalizeOptionalTimestamp(input.requestedAt, 'requestedAt', issues, false);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const recommendedMethodId = normalizeOptionalUuid(
		input.recommendedMethodId,
		'recommendedMethodId',
		issues,
	);
	const summary = normalizeNullableText(input.summary, 'summary', issues, 2_000);
	throwIfIssues('Request control action command is invalid.', issues);
	return {
		type: 'controlOperations.requestControlAction',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			controlType,
			featureId: normalizeRequiredId(input.featureId),
			addressId,
			context,
			recommendedMethodId,
			summary,
			requestedByProfileId: normalizeActorDefaultProfileId(
				input.requestedByProfileId,
				input.actorProfileId,
			),
			requestedAt,
		},
	};
}

export function updateRequestedControlActionDetailsCommand(
	input: UpdateRequestedControlActionDetailsCommandInput,
): UpdateRequestedControlActionDetailsCommand {
	const issues = validateIdCommand(input, 'requestedControlActionId');
	const hasControlType = input.controlType !== undefined;
	const hasMethod = input.recommendedMethodId !== undefined;
	const hasSummary = input.summary !== undefined;
	const hasRequestedBy = input.requestedByProfileId !== undefined;
	const hasRequestedAt = input.requestedAt !== undefined;
	if (!hasControlType && !hasMethod && !hasSummary && !hasRequestedBy && !hasRequestedAt) {
		issues.push({ path: 'changes', message: 'At least one requested action detail must change.' });
	}
	const controlType = hasControlType
		? normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues)
		: undefined;
	const requestedAt = hasRequestedAt
		? normalizeOptionalTimestamp(input.requestedAt, 'requestedAt', issues, false)
		: undefined;
	const recommendedMethodId = hasMethod
		? normalizeOptionalUuid(input.recommendedMethodId, 'recommendedMethodId', issues)
		: undefined;
	const summary = hasSummary
		? normalizeNullableText(input.summary, 'summary', issues, 2_000)
		: undefined;
	const requestedByProfileId = hasRequestedBy
		? normalizeOptionalUuid(input.requestedByProfileId, 'requestedByProfileId', issues)
		: undefined;
	throwIfIssues('Update requested control action details command is invalid.', issues);
	return {
		type: 'controlOperations.updateRequestedControlActionDetails',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			changes: {
				...(controlType !== undefined ? { controlType } : {}),
				...(hasMethod ? { recommendedMethodId: recommendedMethodId ?? null } : {}),
				...(hasSummary ? { summary: summary ?? null } : {}),
				...(hasRequestedBy ? { requestedByProfileId: requestedByProfileId ?? null } : {}),
				...(hasRequestedAt ? { requestedAt: requestedAt ?? null } : {}),
			},
		},
	};
}

export function updateRequestedControlActionLocationAndContextCommand(
	input: UpdateRequestedControlActionLocationAndContextCommandInput,
): UpdateRequestedControlActionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(input, 'requestedControlActionId');
	const context = input.context ? validateContext(input.context, 'requestedAction', issues) : undefined;
	throwIfIssues('Update requested control action location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateRequestedControlActionLocationAndContext',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			changes: locationContextChanges(input, context, issues),
		},
	};
}

export function resolveRequestedControlActionCommand(
	input: ResolveRequestedControlActionCommandInput,
): ResolveRequestedControlActionCommand {
	const issues = validateIdCommand(input, 'requestedControlActionId');
	const resolvedAt = normalizeOptionalTimestamp(input.resolvedAt, 'resolvedAt', issues, false);
	throwIfIssues('Resolve requested control action command is invalid.', issues);
	return {
		type: 'controlOperations.resolveRequestedControlAction',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			resolvedAt,
		},
	};
}

export function reopenRequestedControlActionCommand(
	input: RequestedControlActionIdCommandInput,
): ReopenRequestedControlActionCommand {
	return idCommand('controlOperations.reopenRequestedControlAction', input, 'requestedControlActionId');
}

export function deleteRequestedControlActionCommand(
	input: DeleteRequestedControlActionCommandInput,
): DeleteRequestedControlActionCommand {
	const issues = validateIdCommand(input, 'requestedControlActionId');
	throwIfIssues('Delete requested control action command is invalid.', issues);
	return {
		type: 'controlOperations.deleteRequestedControlAction',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			acknowledgedActionDetach: input.acknowledgedActionDetach ?? false,
			acknowledgedMissionDetach: input.acknowledgedMissionDetach ?? false,
		},
	};
}

export function calculateFormulationComponentAmounts(
	input: CalculateFormulationComponentAmountsInput,
): readonly FormulationComponentAmount[] {
	const issues = createIssues();
	const totalAmount = normalizePositiveFiniteNumber(input.totalAmount, 'totalAmount', issues);
	const diluentRatio = normalizeNonnegativeFiniteNumber(
		input.diluentRatio ?? 0,
		'diluentRatio',
		issues,
	);
	if (!Array.isArray(input.components) || input.components.length === 0) {
		issues.push({ path: 'components', message: 'At least one formulation component is required.' });
	}
	const seen = new Set<string>();
	let componentRatioTotal = 0;
	const components = (input.components ?? []).map((component, index) => {
		requireUuid(component.insecticideId, `components.${index}.insecticideId`, issues);
		const insecticideId = normalizeRequiredId(component.insecticideId);
		if (seen.has(insecticideId)) {
			issues.push({
				path: `components.${index}.insecticideId`,
				message: 'Component insecticide ids must be unique.',
			});
		}
		seen.add(insecticideId);
		const ratio = normalizePositiveFiniteNumber(component.ratio, `components.${index}.ratio`, issues);
		componentRatioTotal += ratio;
		return { insecticideId, ratio };
	});
	if (componentRatioTotal <= 0) {
		issues.push({ path: 'components', message: 'Component ratios must sum to more than zero.' });
	}
	throwIfIssues('Formulation component amounts are invalid.', issues);
	const totalRatio = componentRatioTotal + diluentRatio;
	return components.map((component) => ({
		insecticideId: component.insecticideId,
		ratio: component.ratio,
		amount: Number(((totalAmount * component.ratio) / totalRatio).toFixed(6)),
	}));
}

export function expandFormulationApplicationCommands(
	input: ExpandFormulationApplicationCommandsInput,
): readonly RecordChemicalApplicationCommand[] {
	const amounts = calculateFormulationComponentAmounts(input);
	const amountByInsecticide = new Map(amounts.map((amount) => [amount.insecticideId, amount]));
	const applicationIds = new Set<string>();
	return input.components.map((component, index) => {
		const applicationId = normalizeRequiredId(component.applicationId);
		const issues = createIssues();
		requireUuid(component.applicationId, `components.${index}.applicationId`, issues);
		if (applicationIds.has(applicationId)) {
			issues.push({
				path: `components.${index}.applicationId`,
				message: 'Generated application ids must be unique.',
			});
		}
		applicationIds.add(applicationId);
		requireUuid(component.applicationUnitId, `components.${index}.applicationUnitId`, issues);
		const amount = amountByInsecticide.get(normalizeRequiredId(component.insecticideId));
		if (amount === undefined) {
			issues.push({
				path: `components.${index}.insecticideId`,
				message: 'Component amount could not be calculated.',
			});
		}
		throwIfIssues('Formulation application expansion is invalid.', issues);
		const commandInput: RecordChemicalApplicationCommandInput = {
			organizationId: input.organizationId,
			actorProfileId: input.actorProfileId,
			applicationId: component.applicationId,
			insecticideId: component.insecticideId,
			amountApplied: amount?.amount ?? 0,
			applicationUnitId: component.applicationUnitId,
			applicationDate: input.applicationDate,
			featureId: input.featureId,
			...(input.applicatorProfileId !== undefined
				? { applicatorProfileId: input.applicatorProfileId }
				: {}),
			...(input.addressId !== undefined ? { addressId: input.addressId } : {}),
			...(input.context !== undefined ? { context: input.context } : {}),
			...(input.requestedControlActionId !== undefined
				? { requestedControlActionId: input.requestedControlActionId }
				: {}),
			...(input.applicationMethodId !== undefined
				? { applicationMethodId: input.applicationMethodId }
				: {}),
			...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
			...(input.equipmentId !== undefined ? { equipmentId: input.equipmentId } : {}),
			...(component.applicationBatches !== undefined
				? { applicationBatches: component.applicationBatches }
				: {}),
			...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
		};
		return recordChemicalApplicationCommand(commandInput);
	});
}

export function isSourceReductionUnitType(unitType: UnitType): boolean {
	return SOURCE_REDUCTION_UNIT_TYPES.includes(unitType as (typeof SOURCE_REDUCTION_UNIT_TYPES)[number]);
}

export function isBiocontrolUnitType(unitType: UnitType): boolean {
	return BIOCONTROL_UNIT_TYPES.includes(unitType as (typeof BIOCONTROL_UNIT_TYPES)[number]);
}

function createMethodCommand<
	TType extends ControlOperationsCommandType,
	TInput extends MethodCommandInput,
	TIdKey extends keyof TInput & string,
>(
	type: TType,
	input: TInput,
	idKey: TIdKey,
): ControlOperationsDomainCommand<TType, MethodCommandPayload & Record<TIdKey, DomainId>> {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	const customSchema = normalizeMetadata(input.customSchema, 'customSchema', issues);
	throwIfIssues(`${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			[idKey]: normalizeRequiredId(input[idKey] as string | undefined),
			name,
			customSchema,
		} as MethodCommandPayload & Record<TIdKey, DomainId>,
	};
}

function updateMethodCommand<
	TType extends ControlOperationsCommandType,
	TInput extends ControlCommandInput & {
		readonly name?: string;
		readonly customSchema?: unknown | null;
		readonly acknowledgedHistoricalLabelChange?: boolean;
	},
	TIdKey extends keyof TInput & string,
>(
	type: TType,
	input: TInput,
	idKey: TIdKey,
): ControlOperationsDomainCommand<
	TType,
	ControlCommandPayload &
		Record<TIdKey, DomainId> & {
			readonly changes: Readonly<{
				readonly name?: string;
				readonly customSchema?: JsonObject | null;
			}>;
			readonly acknowledgedHistoricalLabelChange: boolean;
		}
> {
	const issues = validateIdCommand(input, idKey);
	const hasName = input.name !== undefined;
	const hasSchema = input.customSchema !== undefined;
	if (!hasName && !hasSchema) {
		issues.push({ path: 'changes', message: 'At least one method field must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	const customSchema = hasSchema
		? normalizeMetadata(input.customSchema, 'customSchema', issues)
		: undefined;
	throwIfIssues(`${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			[idKey]: normalizeRequiredId(input[idKey] as string | undefined),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasSchema ? { customSchema: customSchema ?? null } : {}),
			},
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		} as ControlCommandPayload &
			Record<TIdKey, DomainId> & {
				readonly changes: Readonly<{
					readonly name?: string;
					readonly customSchema?: JsonObject | null;
				}>;
				readonly acknowledgedHistoricalLabelChange: boolean;
			},
	};
}

function idCommand<
	TType extends ControlOperationsCommandType,
	TInput extends ControlCommandInput,
	TIdKey extends keyof TInput & string,
>(
	type: TType,
	input: TInput,
	idKey: TIdKey,
): ControlOperationsDomainCommand<TType, ControlCommandPayload & Record<TIdKey, DomainId>> {
	const issues = validateIdCommand(input, idKey);
	throwIfIssues(`${humanizeCommandType(type)} command is invalid.`, issues);
	return {
		type,
		payload: {
			...basePayload(input),
			[idKey]: normalizeRequiredId(input[idKey] as string | undefined),
		} as ControlCommandPayload & Record<TIdKey, DomainId>,
	};
}

function sourceReductionFieldChanges(
	input: UpdateSourceReductionFieldDetailsCommandInput,
	issues: DomainValidationIssue[],
): UpdateSourceReductionFieldDetailsCommand['payload']['changes'] {
	const hasDate = input.sourceReductionDate !== undefined;
	const hasTechnician = input.technicianProfileId !== undefined;
	const hasMethod = input.sourceReductionMethodId !== undefined;
	const hasAmount = input.sourcesEliminatedAmount !== undefined;
	const hasUnit = input.sourcesEliminatedUnitId !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasDate && !hasTechnician && !hasMethod && !hasAmount && !hasUnit && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one source reduction field must change.' });
	}
	if (hasDate) {
		validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	}
	if (hasMethod) {
		requireUuid(input.sourceReductionMethodId, 'sourceReductionMethodId', issues);
	}
	if (hasUnit) {
		requireUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	}
	const amount = hasAmount
		? normalizePositiveFiniteNumber(input.sourcesEliminatedAmount, 'sourcesEliminatedAmount', issues)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	return {
		...(hasDate ? { sourceReductionDate: input.sourceReductionDate } : {}),
		...(hasTechnician
			? {
					technicianProfileId: normalizeOptionalUuid(
						input.technicianProfileId,
						'technicianProfileId',
						issues,
					),
				}
			: {}),
		...(hasMethod ? { sourceReductionMethodId: normalizeRequiredId(input.sourceReductionMethodId) } : {}),
		...(amount !== undefined ? { sourcesEliminatedAmount: amount } : {}),
		...(hasUnit ? { sourcesEliminatedUnitId: normalizeRequiredId(input.sourcesEliminatedUnitId) } : {}),
		...(hasMetadata ? { metadata: metadata ?? null } : {}),
	};
}

function outreachFieldChanges(
	input: UpdateOutreachActionFieldDetailsCommandInput,
	issues: DomainValidationIssue[],
): UpdateOutreachActionFieldDetailsCommand['payload']['changes'] {
	const hasDate = input.outreachDate !== undefined;
	const hasTechnician = input.technicianProfileId !== undefined;
	const hasMethod = input.outreachMethodId !== undefined;
	const hasReach = input.reach !== undefined;
	const hasDescription = input.reachDescription !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasDate && !hasTechnician && !hasMethod && !hasReach && !hasDescription && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one outreach action field must change.' });
	}
	if (hasDate) {
		validateLocalDate(input.outreachDate, 'outreachDate', issues);
	}
	if (hasMethod) {
		requireUuid(input.outreachMethodId, 'outreachMethodId', issues);
	}
	const reach = hasReach ? normalizePositiveInteger(input.reach, 'reach', issues) : undefined;
	const reachDescription = hasDescription
		? normalizeNullableText(input.reachDescription, 'reachDescription', issues, 2_000)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	return {
		...(hasDate ? { outreachDate: input.outreachDate } : {}),
		...(hasTechnician
			? {
					technicianProfileId: normalizeOptionalUuid(
						input.technicianProfileId,
						'technicianProfileId',
						issues,
					),
				}
			: {}),
		...(hasMethod ? { outreachMethodId: normalizeRequiredId(input.outreachMethodId) } : {}),
		...(reach !== undefined ? { reach } : {}),
		...(hasDescription ? { reachDescription: reachDescription ?? null } : {}),
		...(hasMetadata ? { metadata: metadata ?? null } : {}),
	};
}

function biocontrolFieldChanges(
	input: UpdateBiocontrolActionFieldDetailsCommandInput,
	issues: DomainValidationIssue[],
): UpdateBiocontrolActionFieldDetailsCommand['payload']['changes'] {
	const hasDate = input.biocontrolDate !== undefined;
	const hasTechnician = input.technicianProfileId !== undefined;
	const hasMethod = input.biocontrolMethodId !== undefined;
	const hasAmount = input.amountReleased !== undefined;
	const hasUnit = input.releaseUnitId !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasDate && !hasTechnician && !hasMethod && !hasAmount && !hasUnit && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one biocontrol action field must change.' });
	}
	if (hasDate) {
		validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	}
	if (hasMethod) {
		requireUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues);
	}
	if (hasUnit) {
		requireUuid(input.releaseUnitId, 'releaseUnitId', issues);
	}
	const amount = hasAmount
		? normalizePositiveFiniteNumber(input.amountReleased, 'amountReleased', issues)
		: undefined;
	const metadata = hasMetadata ? normalizeMetadata(input.metadata, 'metadata', issues) : undefined;
	return {
		...(hasDate ? { biocontrolDate: input.biocontrolDate } : {}),
		...(hasTechnician
			? {
					technicianProfileId: normalizeOptionalUuid(
						input.technicianProfileId,
						'technicianProfileId',
						issues,
					),
				}
			: {}),
		...(hasMethod ? { biocontrolMethodId: normalizeRequiredId(input.biocontrolMethodId) } : {}),
		...(amount !== undefined ? { amountReleased: amount } : {}),
		...(hasUnit ? { releaseUnitId: normalizeRequiredId(input.releaseUnitId) } : {}),
		...(hasMetadata ? { metadata: metadata ?? null } : {}),
	};
}

function validateActionBase(input: ActionBaseInput, issues: DomainValidationIssue[]): void {
	validateBase(input, issues);
	requireUuid(input.featureId, 'featureId', issues);
	normalizeOptionalUuid(input.addressId, 'addressId', issues);
	normalizeOptionalUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	normalizeMetadata(input.metadata, 'metadata', issues);
}

function actionBasePayload(
	input: ActionBaseInput,
	metadata: JsonObject | null,
	issues: DomainValidationIssue[],
): ActionBasePayload {
	return {
		...basePayload(input),
		featureId: normalizeRequiredId(input.featureId),
		addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues),
		requestedControlActionId: normalizeOptionalUuid(
			input.requestedControlActionId,
			'requestedControlActionId',
			issues,
		),
		metadata,
	};
}

function validateLocationContextPatchBase<TInput extends ControlCommandInput>(
	input: TInput,
	idKey: keyof TInput & string,
): DomainValidationIssue[] {
	const issues = validateIdCommand(input, idKey);
	const hasFeature = 'featureId' in input && input.featureId !== undefined;
	const hasAddress = 'addressId' in input && input.addressId !== undefined;
	const hasContext = 'context' in input && input.context !== undefined;
	const hasRequested =
		'requestedControlActionId' in input && input.requestedControlActionId !== undefined;
	if (!hasFeature && !hasAddress && !hasContext && !hasRequested) {
		issues.push({ path: 'changes', message: 'At least one location or context field must change.' });
	}
	if (hasFeature) {
		requireUuid(input.featureId as string | undefined, 'featureId', issues);
	}
	if (hasAddress) {
		normalizeOptionalUuid(input.addressId as string | null | undefined, 'addressId', issues);
	}
	if (hasRequested) {
		normalizeOptionalUuid(
			input.requestedControlActionId as string | null | undefined,
			'requestedControlActionId',
			issues,
		);
	}
	return issues;
}

function locationContextChanges(
	input: {
		readonly featureId?: DomainId;
		readonly addressId?: DomainId | null;
		readonly requestedControlActionId?: DomainId | null;
	},
	context: ControlActionContext | undefined,
	issues: DomainValidationIssue[],
): Readonly<{
	readonly featureId?: DomainId;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: DomainId | null;
}> {
	const hasFeature = input.featureId !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasRequested = input.requestedControlActionId !== undefined;
	return {
		...(hasFeature ? { featureId: normalizeRequiredId(input.featureId) } : {}),
		...(hasAddress ? { addressId: normalizeOptionalUuid(input.addressId, 'addressId', issues) } : {}),
		...(context !== undefined ? { context } : {}),
		...(hasRequested
			? {
					requestedControlActionId: normalizeOptionalUuid(
						input.requestedControlActionId,
						'requestedControlActionId',
						issues,
					),
				}
			: {}),
	};
}

function validateContext(
	context: ControlActionContext,
	allowedFor:
		| 'chemicalApplication'
		| 'sourceReduction'
		| 'outreach'
		| 'biocontrol'
		| 'requestedAction'
		| ControlType,
	issues: DomainValidationIssue[],
): ControlActionContext {
	if (context?.kind === 'none') {
		return { kind: 'none' };
	}
	if (context?.kind === 'adult') {
		requireUuid(context.collectionId, 'context.collectionId', issues);
		if (
			!['chemicalApplication', 'requestedAction', 'application'].includes(allowedFor)
		) {
			issues.push({ path: 'context.kind', message: 'Adult collection context is not allowed here.' });
		}
		return { kind: 'adult', collectionId: normalizeRequiredId(context.collectionId) };
	}
	if (context?.kind === 'larval') {
		const hasHabitat = context.habitatId !== undefined && normalizeOptionalId(context.habitatId) !== null;
		const hasInspection =
			context.inspectionId !== undefined && normalizeOptionalId(context.inspectionId) !== null;
		if (!hasHabitat && !hasInspection) {
			issues.push({
				path: 'context',
				message: 'Larval context requires habitatId or inspectionId.',
			});
		}
		if (hasHabitat) {
			requireUuid(context.habitatId, 'context.habitatId', issues);
		}
		if (hasInspection) {
			requireUuid(context.inspectionId, 'context.inspectionId', issues);
		}
		if (allowedFor === 'outreach') {
			if (hasHabitat) {
				issues.push({
					path: 'context.habitatId',
					message: 'Outreach context cannot reference a habitat directly.',
				});
			}
			if (!hasInspection) {
				issues.push({
					path: 'context.inspectionId',
					message: 'Outreach larval context requires inspectionId.',
				});
			}
		}
		return {
			kind: 'larval',
			...(hasHabitat ? { habitatId: normalizeRequiredId(context.habitatId) } : {}),
			...(hasInspection ? { inspectionId: normalizeRequiredId(context.inspectionId) } : {}),
		};
	}
	issues.push({ path: 'context.kind', message: 'context.kind is not supported.' });
	return { kind: 'none' };
}

function validateApplicationBatches(
	values: readonly ApplicationBatchInput[],
	issues: DomainValidationIssue[],
): readonly ApplicationBatchInput[] {
	if (!Array.isArray(values)) {
		issues.push({ path: 'applicationBatches', message: 'applicationBatches must be an array.' });
		return [];
	}
	const applicationBatchIds = new Set<string>();
	const insecticideBatchIds = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value.applicationBatchId, `applicationBatches.${index}.applicationBatchId`, issues);
		requireUuid(value.insecticideBatchId, `applicationBatches.${index}.insecticideBatchId`, issues);
		const applicationBatchId = normalizeRequiredId(value.applicationBatchId);
		const insecticideBatchId = normalizeRequiredId(value.insecticideBatchId);
		if (applicationBatchIds.has(applicationBatchId)) {
			issues.push({
				path: `applicationBatches.${index}.applicationBatchId`,
				message: 'applicationBatchId values must be unique.',
			});
		}
		if (insecticideBatchIds.has(insecticideBatchId)) {
			issues.push({
				path: `applicationBatches.${index}.insecticideBatchId`,
				message: 'insecticideBatchId values must be unique.',
			});
		}
		applicationBatchIds.add(applicationBatchId);
		insecticideBatchIds.add(insecticideBatchId);
		return { applicationBatchId, insecticideBatchId };
	});
}

function validateBase(input: ControlCommandInput, issues: DomainValidationIssue[]): void {
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
}

function validateIdCommand<T extends ControlCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function basePayload(input: ControlCommandInput): ControlCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
	};
}

function validateLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		issues.push({ path, message: `${path} must be a YYYY-MM-DD date string.` });
		return;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		issues.push({ path, message: `${path} must be a valid calendar date.` });
	}
}

function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	if (!allowFuture && value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

function normalizePositiveFiniteNumber(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive finite number.` });
		return 0;
	}
	return value;
}

function normalizeNonnegativeFiniteNumber(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative finite number.` });
		return 0;
	}
	return value;
}

function normalizePositiveInteger(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive integer.` });
		return 0;
	}
	return value;
}

function normalizeMetadata(
	value: unknown | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): JsonObject | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		issues.push({ path, message: `${path} must be a JSON object or null.` });
		return null;
	}
	return value as JsonObject;
}

function normalizeRequiredText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string {
	const normalized = normalizeNullableText(value, path, issues, maxLength);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	return normalized;
}

function normalizeNullableText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (trimmed.length > maxLength) {
		issues.push({ path, message: `${path} must be ${maxLength} characters or fewer.` });
	}
	return trimmed;
}

function normalizeNullableUrl(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 2_000);
	if (normalized === null) {
		return null;
	}
	if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(normalized)) {
		issues.push({ path, message: `${path} must be a valid URL.` });
		return null;
	}
	return normalized;
}

function normalizeStringUnion<TValue extends string>(
	value: string | undefined,
	allowedValues: readonly TValue[],
	path: string,
	issues: DomainValidationIssue[],
): TValue {
	if (value === undefined || !allowedValues.includes(value as TValue)) {
		issues.push({ path, message: `${path} is not supported.` });
		return (allowedValues[0] ?? '') as TValue;
	}
	return value as TValue;
}

function requireUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const normalized = normalizeOptionalId(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return;
	}
	if (!isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
}

function normalizeOptionalUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeOptionalId(value);
	if (normalized !== null && !isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
	return normalized;
}

function normalizeRequiredId(value: string | null | undefined): string {
	return normalizeOptionalId(value) ?? '';
}

function normalizeActorDefaultProfileId(
	value: string | null | undefined,
	actorProfileId: string,
): string {
	return normalizeOptionalId(value) ?? normalizeRequiredId(actorProfileId);
}

function normalizeOptionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createIssues(): DomainValidationIssue[] {
	return [];
}

function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}

function humanizeCommandType(type: string): string {
	const command = type.split('.').at(-1) ?? type;
	return command.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}
