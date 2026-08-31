import { describe, expect, it } from 'vitest';
import { showsEnvironmentBanner } from '../../../../components/app-shell/environment-banner';

describe('showsEnvironmentBanner', () => {
	it('draws on staging', () => {
		expect(showsEnvironmentBanner('staging')).toBe(true);
		expect(showsEnvironmentBanner('Staging')).toBe(true);
		expect(showsEnvironmentBanner(' staging ')).toBe(true);
	});

	/*
	 * The case the comparison exists for. A Docker `ARG` the image declares and
	 * the build never passes reaches the app as `''`, not `undefined` (#85), so a
	 * truthiness check would have been correct in development and silently right
	 * in production for the wrong reason. Both forms of absent are production.
	 */
	it('treats an unset and an empty variable alike, and both as production', () => {
		expect(showsEnvironmentBanner(undefined)).toBe(false);
		expect(showsEnvironmentBanner('')).toBe(false);
		expect(showsEnvironmentBanner('   ')).toBe(false);
		expect(showsEnvironmentBanner('production')).toBe(false);
	});

	// Nothing else opts in, so a typo in the Railway field shows no banner rather
	// than a banner naming an environment that does not exist.
	it('ignores any other name', () => {
		expect(showsEnvironmentBanner('stage')).toBe(false);
		expect(showsEnvironmentBanner('staging-2')).toBe(false);
		expect(showsEnvironmentBanner('develop')).toBe(false);
	});
});
