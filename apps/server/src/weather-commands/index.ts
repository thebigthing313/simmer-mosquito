/**
 * The weather domain's server half.
 *
 * Nine of the ten commands are reachable through `/commands/weather_sources` and
 * `/commands/weather_summaries`, registered from `table-commands/weather.ts` with
 * the writers in this folder. Only the spreadsheet import needs a route of its
 * own, so that is all this module registers.
 *
 * One export, matching every other command family: `main.ts` reaches for a
 * register function and nothing else, so the next weather route added here does
 * not also mean editing `main.ts`.
 */

export { registerWeatherImportRoute } from './import.js';
