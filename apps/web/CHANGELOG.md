# @simmer-mosquito/web

## 0.2.0 — 2026-08-13

### Minor Changes

- Added: A trap can be set on one visit and emptied on another. Leave the collected date empty and the collection is saved with the trap still out, shown as "Trap out" wherever a collection's flags appear; Collect, on the collection or on the assignment stop that sent you back to it, records what you retrieved. Recording it off a stop closes that stop.

  Changed: When recording work against a stop is refused for something only the server can see — the stop is already completed, the record names a different place than the stop does, the work does not cover the ground the stop names — the refusal now asks instead of stopping. Confirming records the work as it stands. A record of the wrong kind for the stop is still refused outright.

- Added: A Trap Directory under Adult Surveillance, listing every active trap by collection method. Pick one to read its collections a season at a time — each date expands to the species identified in it — and record a new collection for that trap without leaving the page. The last three seasons open by default; older ones load on request.

  Changed: Adult surveillance dates now carry the weekday they fell on — "Wed, Aug 12" — on trap collection lists, collection records, and the overview. Trap runs are weekly, so the day of the week is what tells you whether a gap is a missed visit or a weekend.

- Added: Activity Monitor, in Overview, shows one person's field work over a date range on one map — habitats and traps they recorded, inspections, trap set and collect visits, chemical, source reduction and biocontrol work, outreach, and service requests they took or closed. Pins are coloured by domain, the list beside the map is grouped by day, and the two share one selection; clicking a pin opens the record's card and its details. It opens on you and on today, and the person and the dates are in the address, so a particular person's particular day can be sent to someone. Records the person only assisted on appear too, drawn hollow to keep them apart from work they ran — until now, an assisting crew member appeared by name on nothing. A trap set on one day and collected on another appears on both. Ranges are capped at 92 days, and a log too large to return in full says so rather than looking complete. Each person in My Organization now has an Activity link that opens their day.

- Changed: Activity Monitor dates work in your agency's timezone rather than your browser's, so a trap placed at 9pm belongs to the day the crew worked. Days and the domains within them now fold, each showing its own count, so a wide range reads as a list of days instead of hundreds of rows. Picking a row moves the map to it, the way the explorers do. A log too large to return in full now says how many entries it is missing rather than only that it is missing some, and a note under the list states plainly what the log cannot show — that a habitat or trap pin means the record was entered, not that the person stood there; that most entries carry no time of day; that assisting crew can only be recorded on six kinds of record; and that a trap recorded with a date and duration has no separate set time.

- Added: KMZ files are accepted everywhere KML already was — importing regions in bulk, filling a record's geometry from a file, and setting an agency's boundaries up in the console. A file saved out of Google Earth no longer has to be re-exported first, and it stays on your device as before.

- Added: An assignment stop can now be finished by recording the work it was created for. Habitat stops offer "Record inspection" and trap stops "Record collection", which open the matching form and, on save, file the record and close the stop together — the record remembers which stop produced it, and the stop remembers what closed it. Recording the first stop of the day also starts the assignment. Done and Skip remain for corrections and for service request stops.

  Added: A mission stop can be finished the same way. Each stop offers the one kind of record its mission is for — application, source reduction, biocontrol, or outreach — and filing it links the record to the stop and closes the stop together. The location, the requested action, and the method default from the mission, and work recorded away from the stop it was dispatched to asks before it is accepted.

### Patch Changes

- Fixed: A date or time you type is now stored as the moment it names on the Agency's clock. Dates already read back in the Agency's timezone, but the saving half still used the browser's, so the two could disagree. An assignment's due time and a mission's scheduled start were written in whatever timezone the person filling the form was sitting in — set a 4pm deadline or a 6am muster from anywhere other than the yard and the crew read a different time than the one that was set, and simply reopening the record to save an unrelated change moved it again. A collection's date was stored at midday UTC, which lands on the following day for an agency at UTC+12 or beyond, so every surface filed it under the wrong day.

- Fixed: A region dragged into another folder no longer stays dimmed after the drop, and a folder now accepts a drop anywhere on it rather than on its header alone.

- Fixed: Dates and times across the app now read in the Agency's timezone rather than in the browser's or the database server's. A mosquito control agency's day is a local operational day, so a trap placed at 9pm, a collection emptied before dawn, and an application logged at the end of a shift belong to the day the crew worked. Previously a supervisor in one timezone and a collector in another saw different answers on the same page, and at the edge of a date range an evening's work was not merely shown on the wrong day — it was outside the window that had been asked for, so it disappeared. This covers the day every page treats as "today", the date every new record is stamped with, every rendered time of day, the year a trap's collections are filed under, and the windows the collections explorer and the service-request nearby view filter by. Daylight saving is resolved at the moment in question, so a window is not an hour off for half the season.

  Fixed: An inspection date, an application date, and a mission's rain date read as the day before wherever the browser sits west of Greenwich. They are calendar days rather than moments, and are now rendered as the days they are.

## 0.1.0 — 2026-08-10

### Minor Changes

- Added: The first release in production use — surveillance, control operations, GIS, public engagement, and field assignments, with the agency workspace, maps, and live sync behind them.
- Added: A version number under the SIMMER logo, linking to this page.
