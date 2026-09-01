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
