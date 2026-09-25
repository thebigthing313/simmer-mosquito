/**
 * Whether this machine names its shortcut modifier Command rather than Ctrl.
 *
 * Every shortcut in SIMMER accepts either key, so this decides only what a hint
 * prints. The comment box printed `⌘↵ to send` on every machine, which on
 * Windows names a key that is not on the keyboard. `navigator.platform` is
 * deprecated and still the one field every browser fills; the user-agent
 * client hint is read first where it exists.
 */
export function isApplePlatform(): boolean {
	if (typeof navigator === 'undefined') {
		return false;
	}
	const hinted = (navigator as { readonly userAgentData?: { readonly platform?: string } })
		.userAgentData?.platform;
	return /mac|iphone|ipad|ipod/i.test(hinted ?? navigator.platform ?? '');
}

/** The shortcut modifier as a hint prints it: `⌘` on Apple platforms, `Ctrl` elsewhere. */
export function modifierKeyLabel(): string {
	return isApplePlatform() ? '⌘' : 'Ctrl';
}
