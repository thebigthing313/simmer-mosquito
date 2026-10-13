/** @vitest-environment jsdom */

/**
 * What a record page's `...` menu and a mission stop call the create forms
 * they open (#1702).
 *
 * Both used to spell their own labels, and the nouns disagreed with
 * `RECORD_NOUNS`: a mission stop offered "Record biocontrol" and a detail menu
 * "Record biocontrol release" for a form the register calls a biocontrol
 * action. Both read the record type's create verb and the register's singular
 * now, so one destination reads the same words in both: sentence case in the
 * menu, Title Case on the stop's button, which has visible text.
 */

import type { ControlType } from '@simmer-mosquito/domain';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionStopView } from '../../../components/operations/operations-data';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('../../../hooks/use-can-write', () => ({ useHasRole: () => true }));

const { createItems } = await import('../../../components/record');
const { MissionStopRow } = await import('../../../components/operations/missions/mission-stop-row');

afterEach(cleanup);

describe('a detail page menu', () => {
	it('offers a trap page Record collection', () => {
		const items = createItems('trapId', 'trap-1', ['/adult-surveillance/collections/create']);

		expect(items.map((item) => item.label)).toEqual(['Record collection']);
	});

	it('names every create form with its verb and the register noun', () => {
		const items = createItems('habitatId', 'habitat-1', [
			'/adult-surveillance/collections/create',
			'/adult-surveillance/traps/create',
			'/control-operations/biocontrol/create',
			'/control-operations/chemical/create',
			'/control-operations/source-reduction/create',
			'/larval-surveillance/habitats/create',
			'/larval-surveillance/inspections/create',
			'/public-engagement/service-requests/create',
		]);

		expect(items.map((item) => item.label)).toEqual([
			'Record collection',
			'Create trap',
			'Record biocontrol action',
			'Record chemical application',
			'Record source reduction',
			'Create habitat',
			'Record inspection',
			'Create service request',
		]);
	});
});

const STOP: MissionStopView = {
	missionItemId: 'item-1',
	name: 'Ditch 14',
	ordinal: 1,
	position: 1,
	lat: 40,
	lng: -74,
	geometry: null,
	requestedControlActionId: null,
	request: null,
	addressId: null,
	addressLabel: null,
	progress: 'pending',
	skipReason: null,
	completedAt: null,
	skippedAt: null,
	hasLocation: true,
	isResolving: false,
};

function renderStop(controlType: ControlType) {
	render(
		<MissionStopRow
			controlType={controlType}
			count={1}
			focus={{ highlighted: false, onHover: () => {}, onSelect: () => {}, selected: false }}
			index={0}
			missionId="mission-1"
			onAction={() => {}}
			onMove={() => {}}
			onRemove={() => {}}
			onRename={() => {}}
			ordinal={1}
			planEditable={false}
			progressEnabled
			recordEnabled
			stop={STOP}
		/>,
	);
}

describe('a mission stop', () => {
	it.each([
		['application', 'Record Chemical Application', '/control-operations/chemical/create'],
		['source_reduction', 'Record Source Reduction', '/control-operations/source-reduction/create'],
		['biocontrol', 'Record Biocontrol Action', '/control-operations/biocontrol/create'],
		['outreach', 'Record Outreach Action', '/public-engagement/outreach/create'],
	] as const)('on a %s mission offers %s', (controlType, label, to) => {
		renderStop(controlType);

		expect(screen.getByRole('link', { name: label }).getAttribute('href')).toBe(to);
	});

	it('reads the same words as the detail menu for the same form, in its own case', () => {
		renderStop('biocontrol');
		const labels = createItems('habitatId', 'habitat-1', [
			'/control-operations/biocontrol/create',
		]).map((item) => item.label.toLowerCase());

		expect(labels).toEqual([screen.getByRole('link').textContent?.toLowerCase()]);
	});
});
