import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApplePlatform, modifierKeyLabel } from '../../../lib/modifier-key';

/**
 * The comment box printed `⌘↵ to send` on every machine, naming a key a
 * Windows keyboard does not have. The hint reads the platform now.
 */
describe('modifierKeyLabel', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		['MacIntel', '⌘'],
		['iPhone', '⌘'],
		['Win32', 'Ctrl'],
		['Linux x86_64', 'Ctrl'],
	])('names the modifier on %s as %s', (platform, label) => {
		vi.stubGlobal('navigator', { platform });

		expect(modifierKeyLabel()).toBe(label);
	});

	it('reads the client hint ahead of the deprecated field', () => {
		vi.stubGlobal('navigator', { platform: 'MacIntel', userAgentData: { platform: 'Windows' } });

		expect(isApplePlatform()).toBe(false);
	});
});
