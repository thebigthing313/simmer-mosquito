/** `1 stop` / `n stops`. */
export function stopCountLabel(count: number): string {
	return count === 1 ? '1 stop' : `${count} stops`;
}

/** `1 route` / `n routes`. */
export function routeCountLabel(count: number): string {
	return count === 1 ? '1 route' : `${count} routes`;
}
