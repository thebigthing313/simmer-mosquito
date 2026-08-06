import type { RoutePlanningSurface } from '../../../components/route-planning';

/** Route planning over habitats. */
export const habitatRouteSurface: RoutePlanningSurface = {
	routeType: 'habitat',
	title: 'Routes',
	stopNounPlural: 'habitats',
	namePlaceholder: 'e.g. North catch basins — Monday',
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
