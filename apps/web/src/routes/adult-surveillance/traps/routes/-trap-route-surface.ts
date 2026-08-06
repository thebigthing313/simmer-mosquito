import type { RoutePlanningSurface } from '../../../../components/route-planning';

/** Route planning over traps. */
export const trapRouteSurface: RoutePlanningSurface = {
	routeType: 'trap',
	title: 'Trap Routes',
	stopNounPlural: 'traps',
	namePlaceholder: 'e.g. North CDC traps — Monday',
	indexLink: { to: '/adult-surveillance/traps/routes' },
	detailLink: (routeId) => ({
		to: '/adult-surveillance/traps/routes/$id',
		params: { id: routeId },
	}),
	editLink: (routeId) => ({
		to: '/adult-surveillance/traps/routes/$id/edit',
		params: { id: routeId },
	}),
};
