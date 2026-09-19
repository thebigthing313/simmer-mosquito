import type { OrganizationFoundations } from '../../api';
import type { LookupKind } from '../../hooks/queries/use-organization-foundations';
import { AddressForm } from './address-form';
import type { CreateFoundation, SubmitFoundation } from './foundation-form-shell';
import { LookupForm } from './lookup-form';
import { RegionFolderForm } from './region-folder-form';
import { RegionForm } from './region-form';
import { SpeciesForm } from './species-form';
import { TrapForm } from './trap-form';

export type DialogKind =
	| { readonly kind: 'region-folder' }
	| { readonly kind: 'region' }
	| { readonly kind: 'address' }
	| { readonly kind: 'species' }
	| { readonly kind: 'trap' }
	| { readonly kind: 'lookup'; readonly lookupKind: LookupKind };

/** One form per foundation kind; this picks between them. */
export function FoundationForm({
	dialog,
	foundations,
	availableSpecies,
	create,
	onSubmit,
}: {
	readonly dialog: DialogKind;
	readonly foundations: OrganizationFoundations;
	readonly availableSpecies: OrganizationFoundations['species'];
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	switch (dialog.kind) {
		case 'region-folder':
			return <RegionFolderForm create={create} onSubmit={onSubmit} />;
		case 'region':
			return <RegionForm create={create} folders={foundations.regionFolders} onSubmit={onSubmit} />;
		case 'address':
			return <AddressForm create={create} onSubmit={onSubmit} />;
		case 'species':
			return <SpeciesForm available={availableSpecies} create={create} onSubmit={onSubmit} />;
		case 'lookup':
			return <LookupForm create={create} kind={dialog.lookupKind} onSubmit={onSubmit} />;
		case 'trap':
			return <TrapForm create={create} foundations={foundations} onSubmit={onSubmit} />;
	}
}
