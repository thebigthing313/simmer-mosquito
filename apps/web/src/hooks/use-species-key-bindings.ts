import {
	resolveEffectiveSpeciesKeyBindings,
	type SpeciesKeyBindings,
} from '@simmer-mosquito/domain';
import { useMemo } from 'react';
import { useOrganizationSettings } from './queries/use-organization-settings';
import { useSpeciesNames } from './queries/use-species-names';

/** A stored binding joined to the species it records. */
export interface ResolvedSpeciesKeyBinding {
	readonly key: string;
	readonly speciesId: string;
	/** The species display name, or null when the taxonomy no longer carries it. */
	readonly speciesName: string | null;
}

export interface SpeciesKeyBindingsView {
	readonly bindings: readonly ResolvedSpeciesKeyBinding[];
	/** Key press → binding. Keys are lowercase. */
	readonly byKey: ReadonlyMap<string, ResolvedSpeciesKeyBinding>;
	/** Species id → the key that records it, for annotating species lists. */
	readonly keyBySpeciesId: ReadonlyMap<string, string>;
	readonly hasBindings: boolean;
}

/**
 * The effective key binding set for the signed-in person.
 *
 * v1 resolves the agency's set only. The user-scope seam lives in
 * `resolveEffectiveSpeciesKeyBindings` — when personal bindings gain a home, pass
 * them here and every consumer picks the change up unchanged.
 */
export function useSpeciesKeyBindings(): SpeciesKeyBindingsView {
	const { speciesKeyBindings } = useOrganizationSettings();
	const nameById = useSpeciesNames();

	return useSpeciesKeyBindingsView(speciesKeyBindings, nameById);
}

function useSpeciesKeyBindingsView(
	organizationBindings: SpeciesKeyBindings,
	nameById: ReadonlyMap<string, string>,
): SpeciesKeyBindingsView {
	return useMemo(() => {
		const effective = resolveEffectiveSpeciesKeyBindings({ organization: organizationBindings });

		const bindings = effective.bindings.map((binding) => ({
			key: binding.key,
			speciesId: binding.speciesId,
			speciesName: nameById.get(binding.speciesId) ?? null,
		}));

		return {
			bindings,
			byKey: new Map(bindings.map((binding) => [binding.key, binding] as const)),
			keyBySpeciesId: new Map(bindings.map((binding) => [binding.speciesId, binding.key] as const)),
			hasBindings: bindings.length > 0,
		};
	}, [organizationBindings, nameById]);
}
