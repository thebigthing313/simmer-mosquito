import { recordNoun } from '../../../lib/record-nouns';
import type { RoutePlanningSurface } from '../../route-planning';

/** Route planning over habitats. */
export const habitatRouteSurface: RoutePlanningSurface = {
	routeType: 'habitat',
	title: recordNoun('route').titleMany,
	stopNounPlural: 'habitats',
	namePlaceholder: 'e.g. North catch basins on Monday',
	indexLink: { to: '/larval-surveillance/habitats/routes' },
	detailLink: (routeId) => ({
		to: '/larval-surveillance/habitats/routes/$id',
		params: { id: routeId },
	}),
	editLink: (routeId) => ({
		to: '/larval-surveillance/habitats/routes/$id/edit',
		params: { id: routeId },
	}),
};
