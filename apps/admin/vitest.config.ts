import { mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.js';
import viteConfig from './vite.config.js';

/**
 * The shared config over this app's vite config, for the reason
 * `apps/web/vitest.config.ts` gives: vitest reads this file instead of
 * `vite.config.ts` once it exists, so the plugins and the session-transport
 * setup file have to be merged in rather than left behind. The worker floor is
 * inherited for the reason given there too, which was measured on CI across the
 * two apps together.
 */
export default mergeConfig(viteConfig, shared);
