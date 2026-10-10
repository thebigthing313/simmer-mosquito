/** @vitest-environment jsdom */

/**
 * The summary and the chips name an id through one option source (#1611).
 * Both read the source the id set's declaration names, so an id the source
 * holds reads its name in both, and an id it does not hold reads the
 * declaration's unknown text in both, with no name map handed in by the page.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trapFilterDeclarations } from '../../../../components/adult-surveillance/traps/trap-filters';
import { trapRecordSet } from '../../../../components/adult-surveillance/traps/traps-search';
import { DeclaredFilterChips } from '../../../../components/explorer/declared-filters';
import { DeclaredSummary } from '../../../../components/explorer/declared-summary';
import { serviceRequestFilterDeclarations } from '../../../../components/public-engagement/service-requests/service-request-filters';
import { serviceRequestRecordSet } from '../../../../components/public-engagement/service-requests/service-requests-search';
import type { MapSummary } from '../../../../hooks/explorer/use-explorer-summary';
import { recordSetBinding } from './record-set-binding';

const GRAVID = 'method-gravid';
const DRAINAGE = 'tag-drainage';
// An id each source does not hold, such as a retired row's.
const GONE = 'id-gone';

vi.mock('../../../../hooks/explorer/use-catalog-options', () => ({
	useCatalogOptions: () => ({ options: [], nameById: new Map([[GRAVID, 'Gravid']]) }),
}));
vi.mock('../../../../hooks/explorer/use-tag-options', () => ({
	useTagOptions: () => ({
		options: [],
		byId: new Map([[DRAINAGE, { id: DRAINAGE, name: 'Drainage', color: null }]]),
	}),
}));

afterEach(cleanup);

const STATE = { isError: false, retry: () => undefined } as const;

function button(name: string): HTMLElement {
	return screen.getByRole('button', { name });
}

describe('the summary and the chips', () => {
	it('name a catalog id the same way, and an id the catalog does not hold as unknown', () => {
		const summary: MapSummary = {
			total: 205,
			groups: {
				collectionMethodId: [
					{ value: GRAVID, count: 200 },
					{ value: GONE, count: 5 },
				],
			},
		};
		const binding = recordSetBinding(trapRecordSet, 'map', {
			methods: new Set([GRAVID, GONE]),
		});
		render(
			<DeclaredSummary
				binding={binding}
				chips={<DeclaredFilterChips binding={binding} declarations={trapFilterDeclarations} />}
				declarations={trapFilterDeclarations}
				order={['methods']}
				recordType="trap"
				state={{ ...STATE, data: summary }}
			/>,
		);

		expect(button('Gravid, 200 traps').getAttribute('aria-pressed')).toBe('true');
		expect(button('Remove Gravid filter')).toBeTruthy();
		expect(button('Unknown method, 5 traps').getAttribute('aria-pressed')).toBe('true');
		expect(button('Remove Unknown method filter')).toBeTruthy();
	});

	it('name a Tag the same way, and a Tag the catalog does not hold as unknown', () => {
		const summary: MapSummary = {
			total: 90,
			groups: {
				tagId: [
					{ value: DRAINAGE, count: 80 },
					{ value: GONE, count: 10 },
				],
			},
		};
		const binding = recordSetBinding(serviceRequestRecordSet, 'map', {
			tags: new Set([DRAINAGE, GONE]),
		});
		render(
			<DeclaredSummary
				binding={binding}
				chips={
					<DeclaredFilterChips binding={binding} declarations={serviceRequestFilterDeclarations} />
				}
				declarations={serviceRequestFilterDeclarations}
				order={['tags']}
				recordType="serviceRequest"
				state={{ ...STATE, data: summary }}
			/>,
		);

		expect(button('Drainage, 80 service requests').getAttribute('aria-pressed')).toBe('true');
		expect(button('Remove Drainage filter')).toBeTruthy();
		expect(button('Unknown tag, 10 service requests').getAttribute('aria-pressed')).toBe('true');
		expect(button('Remove Unknown tag filter')).toBeTruthy();
	});
});
