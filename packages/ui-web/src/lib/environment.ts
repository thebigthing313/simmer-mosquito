/**
 * Which deployment a build was made for, from the one build-time variable that
 * says so.
 *
 * `VITE_SIMMER_ENVIRONMENT` is an `ARG` in both app Dockerfiles and is replaced
 * at build time, so a bundle carries the answer rather than asking at runtime.
 * Two things read it: the environment banner, and the collection layer's
 * hidden-tab visibility override (#380, #381). Both want the same answer, so
 * the comparison is written once here.
 *
 * It lives under `lib/` rather than beside the banner because nothing about it
 * is a component, and the collection layer imports it: `./lib/*` resolves
 * straight to this file, so reading it does not pull React through the app-shell
 * barrel.
 *
 * It stays here rather than moving to `packages/config`, and #639 asked the
 * question deliberately. That package now holds the rules four apps share for
 * reading configuration, and this looks like one of them. It is not: every
 * reader there takes a source object and a key, while this takes a value the
 * call site has already read, and its second consumer is `EnvironmentBanner`
 * two directories away. Moving it would put an edge from the component library
 * to `packages/config` in exchange for one string comparison, which is the
 * trade #644 refused when it left the tileset register out of `apps/web`. The
 * empty-string rule that package does own is a different rule: `configured`
 * decides whether a value is there at all, and this decides whether the value
 * that is there names staging.
 */

/**
 * Whether a build-time environment name is staging.
 *
 * The comparison is against a literal, and that is what makes production the
 * safe default: production needs no variable set at all, and a Docker `ARG` the
 * image declares but the build never passes arrives as `''` rather than
 * `undefined` (#85), which is not `staging` either. A truthiness check would
 * have inverted both of those.
 */
export function isStagingEnvironment(environment: string | undefined): boolean {
	return environment?.trim().toLowerCase() === 'staging';
}
