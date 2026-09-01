import { describe, expect, it } from 'vitest';
import { isStagingEnvironment } from '../../../lib/environment';

describe('isStagingEnvironment', () => {
	it('recognises staging', () => {
		expect(isStagingEnvironment('staging')).toBe(true);
		expect(isStagingEnvironment('Staging')).toBe(true);
		expect(isStagingEnvironment(' staging ')).toBe(true);
	});

	/*
	 * The case the comparison exists for. A Docker `ARG` the image declares and
	 * the build never passes reaches the app as `''`, not `undefined` (#85), so a
	 * truthiness check would have been correct in development and silently right
	 * in production for the wrong reason. Both forms of absent are production.
	 */
	it('treats an unset and an empty variable alike, and both as production', () => {
		expect(isStagingEnvironment(undefined)).toBe(false);
		expect(isStagingEnvironment('')).toBe(false);
		expect(isStagingEnvironment('   ')).toBe(false);
		expect(isStagingEnvironment('production')).toBe(false);
	});

	// Nothing else opts in, so a typo in the Railway field shows no banner rather
	// than a banner naming an environment that does not exist.
	it('ignores any other name', () => {
		expect(isStagingEnvironment('stage')).toBe(false);
		expect(isStagingEnvironment('staging-2')).toBe(false);
		expect(isStagingEnvironment('develop')).toBe(false);
	});
});
