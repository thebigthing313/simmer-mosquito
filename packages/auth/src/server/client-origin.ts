/** The request's origin fields, with the undefined ones left off the object. */
export function clientOrigin(input: { readonly ipAddress?: string; readonly userAgent?: string }): {
	readonly ipAddress?: string;
	readonly userAgent?: string;
} {
	return {
		...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
		...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
	};
}
