export * from './addresses.js';
export * from './lookup-tables.js';
export * from './mosquito.js';
export * from './regions.js';
export type {
	FoundationCommandType,
	FoundationCommandWarning,
	FoundationDomainCommand,
	FoundationWarningCode,
} from './shared.js';

import type {
	CreateAddressCommand,
	DeleteAddressCommand,
	MergeAddressesCommand,
	UpdateAddressDetailsCommand,
	UpdateAddressLocationCommand,
} from './addresses.js';
import type {
	CreateCollectionLureCommand,
	CreateCollectionMethodCommand,
	CreateHabitatTypeCommand,
	DeactivateCollectionLureCommand,
	DeactivateCollectionMethodCommand,
	DeactivateHabitatTypeCommand,
	DeleteCollectionLureCommand,
	DeleteCollectionMethodCommand,
	DeleteHabitatTypeCommand,
	ReactivateCollectionLureCommand,
	ReactivateCollectionMethodCommand,
	ReactivateHabitatTypeCommand,
	UpdateCollectionLureCommand,
	UpdateCollectionMethodCommand,
	UpdateHabitatTypeCommand,
} from './lookup-tables.js';
import type {
	CreateGenusCommand,
	CreateSpeciesCommand,
	DeleteGenusCommand,
	DeleteSpeciesCommand,
	SelectOrganizationSpeciesCommand,
	UnselectOrganizationSpeciesCommand,
	UpdateGenusCommand,
	UpdateSpeciesCommand,
} from './mosquito.js';
import type {
	CreateRegionCommand,
	CreateRegionFolderCommand,
	DeleteRegionCommand,
	DeleteRegionFolderCommand,
	MoveRegionToFolderCommand,
	UpdateRegionDetailsCommand,
	UpdateRegionFolderCommand,
	UpdateRegionGeometryCommand,
} from './regions.js';

export type FoundationCommand =
	| CreateAddressCommand
	| UpdateAddressDetailsCommand
	| UpdateAddressLocationCommand
	| DeleteAddressCommand
	| MergeAddressesCommand
	| CreateRegionFolderCommand
	| UpdateRegionFolderCommand
	| DeleteRegionFolderCommand
	| CreateRegionCommand
	| UpdateRegionDetailsCommand
	| MoveRegionToFolderCommand
	| UpdateRegionGeometryCommand
	| DeleteRegionCommand
	| CreateGenusCommand
	| UpdateGenusCommand
	| DeleteGenusCommand
	| CreateSpeciesCommand
	| UpdateSpeciesCommand
	| DeleteSpeciesCommand
	| SelectOrganizationSpeciesCommand
	| UnselectOrganizationSpeciesCommand
	| CreateCollectionMethodCommand
	| UpdateCollectionMethodCommand
	| DeactivateCollectionMethodCommand
	| ReactivateCollectionMethodCommand
	| DeleteCollectionMethodCommand
	| CreateCollectionLureCommand
	| UpdateCollectionLureCommand
	| DeactivateCollectionLureCommand
	| ReactivateCollectionLureCommand
	| DeleteCollectionLureCommand
	| CreateHabitatTypeCommand
	| UpdateHabitatTypeCommand
	| DeactivateHabitatTypeCommand
	| ReactivateHabitatTypeCommand
	| DeleteHabitatTypeCommand;
