# @simmer-mosquito/web

## 0.6.0 — 2026-08-31

### Minor Changes

- Added: an environment banner above both rails on staging, naming the environment
  and saying the data is a copy that the next refresh erases. It expands to the
  rule staging enforces, that sign-in accounts, Memberships, roles, Agencies and
  invitations cannot be changed there. Production shows nothing.

## 0.5.0 — 2026-08-31

### Minor Changes

- Fixed: The Activity Monitor keeps the log on screen while a new person or date window loads, instead of dropping back to placeholder rows.

- Added: An address now names the habitats and traps sited at it, and links to each one. Search matches a habitat on its own name and an address on its street, so finding the sites at an address meant searching twice. Both the address result on the search page and the address's own page now carry the links, and a retired site is marked as inactive rather than hidden.

- Added: An ad-hoc inspection can name an address. Picking one places the inspection there when you have not drawn it yet, and gives you a button to move it there when you have.

- Changed: Three writes that quietly removed records now do the removal properly and say what goes. Retiring a habitat takes it off its routes. Deleting a region folder unfiles the regions in it instead of leaving them filed under a folder that is gone. Correcting a chemical application's insecticide drops the batch records that belonged to the old product.

- Changed: Inspections, collections, applications, biocontrol releases, source reductions and outreach now ask for things in the same order: the date, who did the work, where it happened, then what was done.

- Added: Deletes across the app now ask before they take other records with them, and say how many. Habitats, traps, collections, inspections, samples, chemical applications, source reductions, outreach, biocontrol, service requests, control requests, missions, routes and assignments each name what goes and what is only unlinked. Deleting a habitat keeps the inspections and the chemical, source-reduction and biocontrol work recorded there and drops only their link to it. A record with nothing hanging off it deletes without a question.

- Fixed: An explorer's result rail draws only the rows in view, and carries a control that skips past them to the pager. A page of 50 records used to put 150 tab stops between the list and its paging, with no way around them, and re-rendering all 50 on every map move stalled the drag.

- Added: A comment box at the end of every record you create, saved as the first comment on the record. It is not on the edit form; the record's own thread is there for that.

- Added: Create Address and Add Weather Station in the GIS sidebar, and in the search palette. Both pages already existed but had no way in short of typing the URL. Creating an address is open to collectors, matching the server; adding a weather station is manager and above.

- Added: A strip along the bottom of every full-page map says where the map is centred, which way it faces, how far it is zoomed in, and how far a given distance is on screen. The coordinates copy with one button.

  Added: The map's zoom controls reach either end of the range in one press, and a north arrow beside them points at north as the map turns, or puts the map back to north when pressed.

  Changed: The Streets and Satellite views draw in SIMMER's own map styling.

- Added: The maps show a key for the colours they draw, listing only the statuses or densities the current filters can put on screen. Habitats, Inspections, Samples, Traps, Collections and Service Requests each have one.

  Changed: The collections map paints each collection by status, the way the samples map does: amber while the trap is still out, teal once it is in, slate for a zero result, red for a reported problem. The service requests map draws open requests in red and closed ones in the resolved teal every other surface uses for finished work.

  Changed: Rows drop the status pill that repeated their dot. The dot at the left of a habitat, inspection, trap, sample, collection or service request row now draws in the colour the map paints that record and the key names, and reads its status to a screen reader. What the dot cannot say stays: the life-stage strip on an inspection, the species chips on a sample, the Bycatch badge on a collection.

- Changed: Every map page now gives the map the whole stage, with what matched floating over it in a panel that collapses out of the way. Habitats, Traps, Collections, Inspections, Samples, Chemical, Source Reduction, Biocontrol, Outreach, Service Requests, Requests for Control, Addresses, Weather Stations, Regions and the Activity Monitor all move off the half-and-half split. A record you click opens beside the map rather than under the panel, and one picked from the list flies into the part of the map the panel is not covering.

  Changed: The filters moved out of the column above the results and into a card beside them, opened from a control in the panel's header that carries the number of filters set, so a narrowed list still says so while the card is away. The results rail runs the full height under the place search at 400px wide, which is roughly twice the records in view on a laptop screen.

  Changed: Result rows fit what that width can hold. A dated record stacks its year under its day, and a record's badges sit on their own line under whoever did the work rather than beside them. They used to share a line and wrap only when they had to, so a short inspector name left the life-stage strip inline and a long one pushed it down, moving the strip from row to row down the rail.

  Changed: The result list on every explorer scrolls with the same styled scrollbar the rest of the app uses, and shows it whenever there are more rows than fit.

- Added: The map panels have an overflow menu holding what the surface can create and a "Reset filters" entry that puts every filter back to its default. The create action names its record there, in the same words the sidebar uses for the same form, rather than the bare "Record" or "Create" it read as beside a titled panel.

  Changed: New Folder and Import Regions moved into the Regions panel's overflow menu, beside Create Region. All three write regions and none is reached often, and a row of buttons across the top of the panel cost two rows of the tree they act on every time the page opened.

- Added: Cleanup Tools for addresses and contacts. Each page proposes the records that look like duplicates, says what grouped them, and folds a set into whichever one you keep. Addresses are grouped on a shared name, a shared street address, or the same coordinates; contacts on a shared name, email or phone number. Filter the page to one kind of match, and see how many of each there are. One set of records is proposed once however many ways it matched. Merging cannot be undone, and everything that named a retired record names the one you kept instead.

  Added: Merge duplicates from a habitat's own page. Two records for one catch basin agree about nothing except where they are, so they are found by standing at one and looking around rather than by scanning a list. The action on the habitat opens a map of what stands nearby, at 250 ft or 100 m depending on the units your agency works in, and the search widens from there. Pick from the map or the list; the habitat you came from is the one that survives.

  Added: A merge builds the record that survives. Every field is editable in the confirmation, with each value the set holds one click away, so a phone number only the retired record has is kept rather than lost. Values move between fields too: a second number can go into the alternate phone. Left alone, a merge keeps whatever the surviving record already says and fills in only what it left blank.

  Added: Manage registrations from a contact. A registration is always somebody's, so the way in is the contact: press Manage registrations on their page and a half-map surface lists everywhere they asked to be warned before spraying, with the ground each one covers drawn as a buffer rather than a pin. Add a point, a line or an area, draw it on the map beside the form, and it joins the list. The rings already recorded stay drawn while a new one is being added.

  Added: Missions work out who to notify. The Notifications card on a mission lists who is on the list and generates the rest, and says which of "nothing new", "nobody was eligible" and "a buffer unit cannot be measured" happened.

- Changed: Mission edits now say what they are about to walk over. Nineteen confirmations that mission and stop commands already carried were read by nothing, so a save went through whether or not anybody had been asked. Changing the schedule or the plan of a mission crews have already worked, reassigning or adding stops to one that is in progress, cancelling one with work recorded against it, deleting one that ran, moving or removing a stop somebody handled, scheduling a request that is already on another mission or that recommends a different method, starting a mission more than twelve hours early, and any of the four edits that leave a mission's notifications describing something that is no longer true: each is refused with the reason until the answer comes back.

- Changed: Renaming something that records already read under now asks first, and says how many. Rename a collection method with four hundred collections behind it, recode a trap, correct a service request's contact, move a weather station with readings, relabel a lookup catalog, an insecticide, a batch, a vehicle or a piece of equipment, and the save comes back with the count and a confirmation instead of going through unremarked. Retiring a notification type says how many registrations are subscribed to it, and editing a notification registration says how many notices have already gone out under it. A rename nothing cites is still saved without a question, so a same-day correction is unaffected.

- Fixed: A retired trap can be picked on a collection again. The trap picker left retired traps out of its search rows, so a collection opened from a retired trap's page showed the trap but could not offer it back once the field was cleared. Route and assignment planning still offer running traps only.

- Changed: The Regions tree and the Activity Monitor now wear the same placeholder rows and empty states as the other explorers, and the Regions panel tells an agency with no Regions apart from a search that matched none.

- Added: The writes that quietly changed what other records say now ask first, with the number in the question. Marking a collection zero result says how many species counts it deletes, and changing an application's product says how many batch records it drops.

  Added: Giving a trap a code another active trap already carries now asks before it saves. Codes may still be shared, deliberately, and the check compares them the way people read them, ignoring case and surrounding spaces.

  Fixed: The two questions a stop can ask now come back with an answer attached. Recording a second inspection or collection against a stop that is already done says how many are already there, and a record filed against a different habitat or trap than the stop names says which. Both are still one tap to confirm.

  Changed: The questions a weather station raises are worded the same way as every other confirmation now, and list the readings they turn on rather than repeating the server's own sentence.

### Patch Changes

- Fixed: A delete that is refused now lists what still references the record. The refusal already carried that list and the danger zone was dropping it, so the card said only that the delete failed.

- Fixed: Generating notifications for a mission, refused because a registration measures its buffer in something that is not a distance, now lists the registrations at fault. Each one links to the contact that holds it, where the buffer unit can be changed. Ten are listed and the rest are counted.

- Changed: The map now downloads about half of what it used to. Every tile and every result-rail page left the server uncompressed, so framing an agency of 14,245 Habitats pulled 1.2 MB of tiles where 500 KB carries the same drawing, and each page of the rail was 32 KB where 5 KB would do. It applies to all eleven map layers, to the record reads behind the delete checks, and to the sync stream, which is the largest read of all.

- Fixed: Taking the last usable ingredient out of a formulation now takes the formulation out of use with it. It used to leave an active recipe with nothing that could be mixed from it, and an ingredient whose product had been retired still counted as something being in there.

- Fixed: An expired session takes you to the sign-in page and back to the page you were on, instead of replacing the workspace with an error that offered nothing to do.

- Fixed: The Requests for Control filter count now includes the date window, so a narrowed page no longer reads as unfiltered.

- Added: Global search. Press ⌘K, or Ctrl K, or the search button in the header, and a palette opens over whatever you were doing. Type and it searches four things at once: the pages in the sidebar, the create forms you have access to, your records, and your comments. Records cover habitats, traps, samples, service requests, contacts, addresses, regions, routes, assignments, missions, weather stations, and requests for control — by name, by code, and by the description or details written on them. It reads exact codes first, then codes that start with what you typed, then near misses for a typo, then anything whose text matches. Opening the palette with nothing typed lists every create form you can reach, so it doubles as a way to start work. "View all results" opens a full page where the query is editable, results keep loading as you scroll, and a rail on the left shows how many records and how many comments matched. Search only ever returns your agency's records. It does not read custom fields, and it will not find a habitat by the address it sits at.

- Fixed: A result list that fails to load says so and offers to try again, instead of reporting that nothing matched the filters.

  Fixed: The result rail on every map page was drawing its rows wider than the panel holding them, so the status badge and the "view details" chevron were cut off the right edge and long names ran on instead of truncating. On Inspections the row's name column was squeezed to nothing and rows drew with no record name at all.

  Fixed: A map panel with a long title pushed its collapse control off the right edge, so Requests for Control, Service Requests, Weather Stations and the Address Book could not be collapsed. A panel with no pager under it now states its result count in the header instead of nowhere, the filter column no longer scrolls sideways, a rail holding one record says "1 request" rather than "1 requests", and an address row no longer repeats its street line under itself.

  Fixed: Service Requests and Requests for Control counted their default Open status as an active filter, so an untouched page reported one filter set and offered a Clear all with nothing under it.

  Fixed: The collections rail never showed a Trap out badge, because the row it read did not carry the timing mode the badge is decided by. The status is resolved server-side now, so a trap that is still out reads as one.

  Fixed: The map's place search works from the keyboard. Arrow keys move through the suggestions, Enter takes one, and Escape closes the list.

  Fixed: The blue dot in the Inspections key reads "Wet only" rather than "None". Beside it sat "Dry", and nothing told a reader that the first one is water with no larvae in it.

- Fixed: Map layers redraw after a pause instead of coming back empty. Panning at the moment your sign-in needed renewing left the records off the map until the next time you moved it.

- Fixed: Having the app open in several tabs no longer risks ending your session. Each tab renewed your sign-in on its own schedule, and two renewals landing together could sign you out of all of them.

- Added: Picking "Create Inspection" or "Record Collection" in the search palette now asks which habitat or trap first, and opens the form on it. Escape or Back returns to the list, and "Open without a habitat" opens the blank form the action always did. Retired habitats and traps are still offered.

- Changed: Filtering a map by Region now counts an area record as inside a district only when the two overlap, rather than when they merely share a boundary. A habitat polygon that sits alongside a district and shares an edge with it used to come back in that district's filter; it is work next to the district, not in it. Points and lines are unaffected, and so are traps, adult collections and addresses, which are always points. Habitats, inspections, chemical applications, source reductions, biocontrol actions and outreach actions can all answer differently. Measured against production before it shipped: of every area record in the six tables, nine chemical applications fall inside a region and none of them change, so no saved district filter returns a different record today.

- Added: A record's detail page now says which regions it falls inside, as a band under its map. One row per region folder, with the matching regions as links to the region itself, and only folders with a match appear. A record inside nothing says so, because a trap in no spray zone is an answer rather than a gap. It is on eleven record pages, on service requests beside their map, and on weather stations, which gain a map of their own at the same time.

- Fixed: Deleting a notification registration is now refused while a mission notification names it, and the refusal says how many. The delete used to go through and leave those notifications pointing at a registration nobody could see. The registration panel also gets the danger zone card every other record has, which states what the delete reaches before the button is pressed.

- Fixed: A re-invitation that cannot reach WorkOS now says why. Killing the old link is the first thing it does, and when that failed the People page showed the same sentence it shows for any failed write. It now reads either that the invitation could not be sent and to try again shortly, or that trying again will not help. The person keeps the link they already have either way.

- Fixed: A search result for a comment written on a route now waits for the route to load before it opens, instead of opening the habitat route page and reporting that the route does not exist. The row spins while it waits and opens as soon as the route arrives.

- Fixed: Search now marks a retired habitat, trap or weather station. A retired record and an active one came back looking the same, so nothing on the row told you which you were about to open. Both the palette and the results page now show a Retired badge beside the name. Retired records are still searched, still returned, and still ranked exactly where they were.

- Fixed: Your session no longer ends a minute after you sign in. Signing in again is not needed while you keep working, and being signed out mid-task should now be rare enough to notice.

- Fixed: The workspace loads again. Every synced table was arriving empty because the browser could not read the headers that tell it where a sync stream is, so the app reported that it could not find your agency.

## 0.4.0 — 2026-08-21

### Minor Changes

- Added: A page that fails to load now reports what broke, in a panel beside the navigation you were using, instead of a bare block of text with nothing to act on.

- Changed: A workspace that fails to load now names the error, shows the technical detail behind a disclosure, and copies the whole report to your clipboard for a support request.

- Added: Somebody who never got their invitation can be sent a new one, from their row on the People page. It names the address, the role the new link grants, and that the old link stops working.

### Patch Changes

- Fixed: An invitation that cannot be sent now says which of three things went wrong, in SIMMER's words. It used to repeat whatever sentence the sign-in service wrote, which was a string nobody here controls.

- Fixed: Reordering a stop on a route, an assignment or a mission now changes only the stops that moved, so the rest of the list keeps the timestamps it had.

- Fixed: Inviting somebody no longer reports a failure after their email has already gone out.

- Fixed: Sending somebody a new invitation works. One address holds one invitation at a time, and the old one was cancelled only after the replacement had been sent, so the send was refused every time.

- Fixed: A re-invitation or a removal the server refuses now says so on the People page, under the control that asked for it, instead of leaving the sheet reading as it did before the click.

- Fixed: The address a pending colleague was invited at, and the id of their invitation, no longer reach every signed-in person's browser. No screen showed either one.

- Fixed: An agency address is refused if its country is anything but US, the same way its state already was. The form only ever sent US, so nothing on screen changes.

## 0.3.0 — 2026-08-21

### Minor Changes

- Changed: Organization settings now refuse values they cannot use instead of quietly replacing them. A timezone the agency does not support, a unit default naming a code that is not that kind of unit, or a key binding pointing at a species that no longer exists were all accepted and stored as something else, with the save reporting success. Each is now an error that says what was wrong.

  Changed: Saving a setting no longer overwrites changes somebody else made while you had the panel open. Two people editing the agency at once used to end with whoever saved second silently replacing the other's work, including settings they had not touched. A save now covers only the setting it changed, and a genuine collision says so and asks you to reopen.

- Added: Weather stations can now be managed and their readings recorded. Add a station by placing it on the map, edit its name, code or location, retire it when it stops reporting, and delete it when it is gone for good.

  Readings can be entered by hand, covering one day or a stretch of days, with temperature, precipitation, humidity and wind. They can also be loaded in bulk from a CSV or Excel file. Before anything is written the upload shows what each line would do against the readings the station already holds, so a line that would overwrite one is visible before you commit rather than after. Managing weather is a manager-and-above job; collectors and viewers read it as before.

  Renaming a station relabels every reading ever taken there, and moving one relocates all of them, because a reading records neither the station's name nor where it stood. Both now ask before they do it, and so does deleting a station, which takes its readings with it.

### Patch Changes

- Fixed: Deleting an insecticide, vehicle, method, or other catalog entry is now refused while anything still uses it, and the confirmation names what. Deleting one used to succeed and leave those records pointing at an entry that was gone.

- Fixed: A record can no longer be saved against another agency's address, habitat, inspection, contact, or person. Those ids came straight off the request and nothing checked whose they were, so a hand-built request could file your agency's work against a record you would never be able to open.

- Fixed: A form that cannot be saved now says why in its alert, instead of "Unable to save changes."

- Fixed: A deactivated catalog entry can no longer be put on a new record. Deactivating one used to hide it from the pickers and nothing more, so a record that named it another way still saved.

- Fixed: A failed invitation no longer mails a sign-in link the agency has no record of. The invitation used to go out before the person was added, so an address that could not be invited got a working link while the invite came back as an error. Inviting somebody who already has access now says so instead of failing.

- Fixed: Unit defaults could not be changed. Every dropdown in the Unit Defaults editor was empty, so there was nothing to pick, and the summary above it listed raw codes like `miles_per_hour` instead of unit names. Both are fixed, and the list is grouped so metric and imperial units no longer interleave.

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
