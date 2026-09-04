import type { SearchResult } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../../../../auth';
import {
	shellSearchCandidates,
	type WebShellCandidate,
} from '../../../../components/app-shell/navigation';
import {
	bucketServerResults,
	candidateMatches,
	capPaletteGroups,
	matchCandidates,
} from '../../../../components/search/search-matching';

describe('the client-side matcher', () => {
	// A whole-phrase substring test never reaches this, because the phrase is
	// split across the label and the `new` keyword.
	it('reaches Create Habitat from "new hab"', () => {
		expect(candidateMatches(createHabitat, 'new hab')).toBe(true);
	});

	it('takes tokens in any order', () => {
		expect(candidateMatches(createHabitat, 'hab new')).toBe(true);
	});

	// Every token has to land somewhere. OR would make a two-word query match
	// more than a one-word one, which reads as broken.
	it('requires every token to land', () => {
		expect(candidateMatches(createHabitat, 'new trap')).toBe(false);
	});

	it('matches a keyword the label never shows', () => {
		expect(candidateMatches(createHabitat, 'breeding')).toBe(true);
	});

	it('ignores case and surrounding whitespace', () => {
		expect(candidateMatches(createHabitat, '  NEW   HAB  ')).toBe(true);
	});

	it('matches nothing on an empty query', () => {
		expect(candidateMatches(createHabitat, '   ')).toBe(false);
	});

	// The Weather explorer is labelled `Map`, so its own label says nothing about
	// weather. Its keywords are the only thing left that does.
	it('reaches an explorer whose label does not carry its noun', () => {
		const weather = shellSearchCandidates(ownerAuth()).routes.find(
			(candidate) => candidate.id === 'weather',
		);
		if (weather === undefined) {
			throw new Error('the Weather explorer is not in the navigation');
		}

		expect(weather.label).toBe('Map');
		expect(candidateMatches(weather, 'weather')).toBe(true);
		expect(candidateMatches(weather, 'station')).toBe(true);
	});

	it('keeps navigation order', () => {
		const matched = matchCandidates([createHabitat, habitatsMap, createTrap], 'ha');

		expect(matched.map((candidate) => candidate.id)).toEqual(['habitats-create', 'habitats-map']);
	});
});

describe('the ten-row budget', () => {
	// The failure this rule exists for: `elm` returns sixteen indexed hits, all
	// records by class, so without a cap the Comments heading never appears.
	it('never lets one group take every slot', () => {
		const capped = capPaletteGroups({
			pages: [],
			actions: [],
			records: records(16),
			comments: comments(4),
		});

		expect(capped.comments).toHaveLength(2);
		expect(capped.records.length + capped.comments.length).toBe(10);
	});

	it('holds each group to its cap when every group is full', () => {
		const capped = capPaletteGroups({
			pages: pages(5),
			actions: actions(5),
			records: records(9),
			comments: comments(9),
		});

		expect(capped.pages).toHaveLength(2);
		expect(capped.actions).toHaveLength(2);
		expect(capped.records).toHaveLength(4);
		expect(capped.comments).toHaveLength(2);
	});

	// Records first, then comments, then pages, then actions.
	it('gives an unfilled group’s slots to records first', () => {
		const capped = capPaletteGroups({
			pages: [],
			actions: [],
			records: records(20),
			comments: [],
		});

		expect(capped.records).toHaveLength(10);
	});

	it('passes slots down the order when records run out', () => {
		const capped = capPaletteGroups({
			pages: pages(9),
			actions: [],
			records: records(1),
			comments: comments(1),
		});

		expect(capped.records).toHaveLength(1);
		expect(capped.comments).toHaveLength(1);
		expect(capped.pages).toHaveLength(8);
	});

	it('leaves a group with no hits absent rather than empty-headed', () => {
		const capped = capPaletteGroups({ pages: [], actions: [], records: records(3), comments: [] });

		expect(capped.pages).toHaveLength(0);
		expect(capped.comments).toHaveLength(0);
	});

	it('takes the first rows of each group, keeping the server’s order', () => {
		const capped = capPaletteGroups({
			pages: pages(5),
			actions: actions(5),
			records: records(9),
			comments: comments(9),
		});

		expect(capped.records.map((row) => row.id)).toEqual(['r0', 'r1', 'r2', 'r3']);
		expect(capped.comments.map((row) => row.id)).toEqual(['c0', 'c1']);
	});

	// Two groups short of their caps hand their slots to the two that are not,
	// in the fixed order, and the total still lands on ten.
	it('fills to ten across two groups when the other two are absent', () => {
		const capped = capPaletteGroups({
			pages: [],
			actions: [],
			records: records(6),
			comments: comments(6),
		});

		expect(capped.records).toHaveLength(6);
		expect(capped.comments).toHaveLength(4);
	});
});

describe('bucketServerResults', () => {
	// The wire list is flat because a grouped envelope would carry two of four
	// groups: routes and actions never reach the server.
	it('splits the flat list without reordering it', () => {
		const flat = [record('a'), comment('b'), record('c')];

		expect(bucketServerResults(flat).records.map((row) => row.id)).toEqual(['a', 'c']);
		expect(bucketServerResults(flat).comments.map((row) => row.id)).toEqual(['b']);
	});
});

const createHabitat: WebShellCandidate = {
	id: 'habitats-create',
	label: 'Create Habitat',
	to: '/larval-surveillance/habitats/create' as WebShellCandidate['to'],
	keywords: ['new', 'add', 'site', 'breeding', 'source', 'larval'],
	domainLabel: 'Larval Surveillance',
};

const habitatsMap: WebShellCandidate = {
	id: 'habitats-map',
	label: 'Habitats Map',
	to: '/larval-surveillance/habitats' as WebShellCandidate['to'],
	keywords: [],
	domainLabel: 'Larval Surveillance',
};

const createTrap: WebShellCandidate = {
	id: 'traps-create',
	label: 'Add Trap',
	to: '/adult-surveillance/traps/create' as WebShellCandidate['to'],
	keywords: ['new', 'create', 'station', 'adult'],
	domainLabel: 'Adult Surveillance',
};

function record(id: string): SearchResult {
	return {
		kind: 'record',
		id,
		title: id,
		table: 'habitats',
		matchedField: 'habitat_name',
		matchClass: 'text',
	};
}

function comment(id: string): SearchResult {
	return {
		kind: 'comment',
		id,
		title: id,
		targetType: 'habitat',
		targetId: 'target',
		matchedField: 'comment_text',
		matchClass: 'text',
	};
}

function records(count: number): SearchResult[] {
	return Array.from({ length: count }, (_, index) => record(`r${index}`));
}

function comments(count: number): SearchResult[] {
	return Array.from({ length: count }, (_, index) => comment(`c${index}`));
}

function pages(count: number): SearchResult[] {
	return Array.from({ length: count }, (_, index) => ({
		kind: 'route' as const,
		id: `p${index}`,
		title: `p${index}`,
	}));
}

function actions(count: number): SearchResult[] {
	return Array.from({ length: count }, (_, index) => ({
		kind: 'action' as const,
		id: `a${index}`,
		title: `a${index}`,
	}));
}

function ownerAuth(): AuthMe {
	return {
		authenticated: true,
		user: {
			workosUserId: 'user_1',
			email: 'crew@example.test',
			firstName: null,
			lastName: null,
			displayName: 'Crew',
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: 'org_1',
		localIdentity: {
			userId: 'user_1',
			organizationId: 'org_1',
			profileId: 'profile_1',
			membershipId: 'membership_1',
			role: 'owner',
		},
	};
}
