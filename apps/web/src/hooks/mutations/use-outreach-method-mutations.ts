import { outreach_methods } from '../../lib/collections/outreach_methods';
import type { CatalogMutations } from './catalog-fields';
import { useControlMethodMutations } from './use-control-method-mutations';

/** The five catalog writes for outreach methods: create, save, deactivate, reactivate and delete. */
export function useOutreachMethodMutations(): CatalogMutations {
	return useControlMethodMutations(outreach_methods(), {
		create: 'controlOperations.createOutreachMethod',
		update: 'controlOperations.updateOutreachMethod',
		deactivate: 'controlOperations.deactivateOutreachMethod',
		reactivate: 'controlOperations.reactivateOutreachMethod',
		remove: 'controlOperations.deleteOutreachMethod',
	});
}
