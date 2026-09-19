import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import type { CatalogMutations } from './catalog-fields';
import { useControlMethodMutations } from './use-control-method-mutations';

/** The five catalog writes for biocontrol methods: create, save, deactivate, reactivate and delete. */
export function useBiocontrolMethodMutations(): CatalogMutations {
	return useControlMethodMutations(biocontrol_methods(), {
		create: 'controlOperations.createBiocontrolMethod',
		update: 'controlOperations.updateBiocontrolMethod',
		deactivate: 'controlOperations.deactivateBiocontrolMethod',
		reactivate: 'controlOperations.reactivateBiocontrolMethod',
		remove: 'controlOperations.deleteBiocontrolMethod',
	});
}
