import { application_methods } from '../../lib/collections/application_methods';
import type { CatalogMutations } from './catalog-fields';
import { useControlMethodMutations } from './use-control-method-mutations';

/** The five catalog writes for application methods: create, save, deactivate, reactivate and delete. */
export function useApplicationMethodMutations(): CatalogMutations {
	return useControlMethodMutations(application_methods(), {
		create: 'controlOperations.createApplicationMethod',
		update: 'controlOperations.updateApplicationMethod',
		deactivate: 'controlOperations.deactivateApplicationMethod',
		reactivate: 'controlOperations.reactivateApplicationMethod',
		remove: 'controlOperations.deleteApplicationMethod',
	});
}
