import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import type { CatalogMutations } from './catalog-fields';
import { useControlMethodMutations } from './use-control-method-mutations';

/** The five catalog writes for source reduction methods: create, save, deactivate, reactivate and delete. */
export function useSourceReductionMethodMutations(): CatalogMutations {
	return useControlMethodMutations(source_reduction_methods(), {
		create: 'controlOperations.createSourceReductionMethod',
		update: 'controlOperations.updateSourceReductionMethod',
		deactivate: 'controlOperations.deactivateSourceReductionMethod',
		reactivate: 'controlOperations.reactivateSourceReductionMethod',
		remove: 'controlOperations.deleteSourceReductionMethod',
	});
}
