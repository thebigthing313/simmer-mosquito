/** @vitest-environment jsdom */
import { ChangelogPage } from '@simmer-mosquito/ui-web/components/changelog';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The page both consoles mount at `/changelog`, drawn from the shape
 * `changeset version` actually writes.
 *
 * The parser is covered on its own in `packages/ui-web`; what is worth pinning
 * here is that the parse and the render agree — that a real generated file
 * reaches the screen as headings and bullets a user can read, and that the
 * semver sections it was written under are gone by the time it does.
 */
const GENERATED = `# @simmer-mosquito/web

## 0.2.0 — 2026-09-01

### Minor Changes

- Added: Region filters on every map page.

### Patch Changes

- Fixed: A closed service request no longer reopens on refresh.

## 0.1.0 — 2026-08-10

### Minor Changes

- Added: The first release in production use.
`;

function renderPage(currentVersion = '0.2.0') {
	return render(
		<ChangelogPage
			currentVersion={currentVersion}
			description="What has changed in SIMMER, newest first."
			markdown={GENERATED}
			title="What's New"
		/>,
	);
}

describe('ChangelogPage', () => {
	afterEach(cleanup);

	it('draws every release, newest first', () => {
		renderPage();

		const versions = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
		expect(versions).toEqual(['0.2.0', '0.1.0']);
	});

	it('shows the entry text without its category token', () => {
		renderPage();

		expect(screen.getByText('Region filters on every map page.')).toBeTruthy();
		expect(screen.queryByText(/Added:/)).toBeNull();
	});

	it('heads groups with the category, not with the semver bump it was filed under', () => {
		renderPage();

		const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
		expect(headings).toEqual(['Added', 'Fixed', 'Added']);
		expect(screen.queryByText(/Minor Changes|Patch Changes/)).toBeNull();
	});

	it('renders the stamped date as a calendar date, not a UTC instant', () => {
		renderPage();

		// The naive `new Date('2026-08-10')` reading is UTC midnight, which draws
		// as August 9 for every timezone west of Greenwich — which is all of them,
		// for the organizations using this.
		expect(screen.getByText('August 10, 2026')).toBeTruthy();
		expect(screen.queryByText('August 9, 2026')).toBeNull();
	});

	it('badges the release the reader is actually running, and only that one', () => {
		renderPage('0.1.0');

		const badges = screen.getAllByText("You're on this version");
		expect(badges).toHaveLength(1);

		const release = badges[0]?.closest('li');
		expect(release === null || release === undefined).toBe(false);
		expect(within(release as HTMLElement).getByRole('heading', { level: 2 }).textContent).toBe(
			'0.1.0',
		);
	});

	it('draws an untokenized entry above the groups, under no heading of its own', () => {
		render(
			<ChangelogPage
				currentVersion="1.0.0"
				description="What has changed in SIMMER, newest first."
				markdown={'# app\n\n## 1.0.0\n\n- Something happened.\n- Fixed: A crash.\n'}
				title="What's New"
			/>,
		);

		expect(screen.getByText('Something happened.')).toBeTruthy();
		// The invented "Other changes" bucket is gone; only the three real
		// categories get a heading.
		expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
			'Fixed',
		]);
	});

	it('says so plainly when there are no releases yet', () => {
		render(
			<ChangelogPage
				currentVersion="0.1.0"
				description="What has changed in SIMMER, newest first."
				markdown="# @simmer-mosquito/web\n"
				title="What's New"
			/>,
		);

		expect(screen.getByText('No releases have been published yet.')).toBeTruthy();
	});
});
