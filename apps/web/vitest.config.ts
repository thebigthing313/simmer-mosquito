import { mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.js';
import viteConfig from './vite.config.js';

/**
 * The shared config, applied on top of this app's vite config.
 *
 * The other ten projects re-export `vitest.shared.js` and stop there, because
 * none of them has a vite config for vitest to find. This app does, and vitest
 * reads `vitest.config.ts` instead of `vite.config.ts` once one exists, so a
 * bare re-export would drop the React plugin, Tailwind, the router plugin and
 * the session-transport setup file, and every suite here would fail on the
 * first piece of JSX. Importing the vite config and merging into it keeps both
 * halves, and `vite build` still reads `vite.config.ts` on its own.
 *
 * With no config at all this app ran on vitest's own defaults, so neither the
 * shared `dist` exclusion nor the shared worker floor reached the largest suite
 * in the workspace (#662).
 *
 * The worker floor is inherited rather than overridden, and that is the
 * measurement's answer rather than the easy option. The floor of four was sized
 * against six database integration files that wait on Postgres, and these 164
 * are jsdom suites that wait on nothing, so the expectation was that four
 * workers on CI's two vCPUs would cost more than they bought. Eleven CI runs
 * say otherwise: one worker, two and four came out at 146s, 143s and 140s on
 * average for the whole test step, while repeats of a single setting ran
 * anywhere from 113s to 161s. The gap between the settings is smaller than the
 * gap between two runs of the same one, so there is nothing here to justify a
 * second number beside the shared one. Nx already runs three targets at once on
 * those two cores, which is the likeliest reason the fourth fork changes
 * nothing either way.
 */
export default mergeConfig(viteConfig, shared);
