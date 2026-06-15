/** Longest-prefix active-route match shared by every design's navigation. */
export function isActivePath(currentPath: string, target: string): boolean {
	if (target === '/') {
		return currentPath === '/';
	}

	return currentPath === target || currentPath.startsWith(`${target}/`);
}
