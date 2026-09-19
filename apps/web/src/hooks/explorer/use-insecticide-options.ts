import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { insecticides } from '../../lib/collections/insecticides';
import { type CatalogOptions, indexed } from './use-named-catalog';

/** Insecticides by trade name, as filter options and an id to name lookup. */
export function useInsecticideOptions(): CatalogOptions {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ product: insecticides() })
			.orderBy(({ product }) => product.trade_name, 'asc')
			.select(({ product }) => ({ id: product.id, label: product.trade_name })),
	);

	return indexed(result.data);
}
