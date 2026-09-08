# @simmer-mosquito/web

## 0.7.0 — 2026-09-08

### Minor Changes

- Added: the Adult Surveillance overview has an Over Action Threshold panel,
  listing the collections from the last 14 days whose specimen total met or beat
  the action threshold set on the collection method they were made by. Each row
  shows the date, the trap, the method, and the total against the threshold, and
  opens the collection. The panel says so when no collection method has a
  threshold set yet.

- Changed: a suggestion row on the contact and address cleanup pages now shows
  every column the merge can carry, each under its own label: company, department,
  title, email, preferred phone and alternate phone for a contact; the street
  lines, locality, region, postal code and coordinates for an address. The value
  the group matched on is repeated on each row, so you can confirm the match
  instead of taking the heading's word for it. A column the record leaves empty is
  left off. The row wraps a long value onto a second line rather than cutting its
  end off.

- Added: Daily Work at `/daily-work/<profile id>`, one person's field work for a single day, with a day picker, a map key to the record families that day put on screen, and an address you can send somebody.

- Added: a Daily Work group in the Overview sidebar, listing everyone active in your Organization. Pick a name to open that person's day.

- Added: carry on with a shape you have already finished. Continue puts the piece
  back into draw mode with its vertices still on the map and the next click
  adding to the end, so a boundary that stopped one vertex early no longer has to
  be traced again. It sits on the location panel at one piece and on each piece's
  row once there are more, beside Cut hole. A point has nothing to continue, so it
  does not offer it.

  Added: cancelling a continuation leaves the piece exactly as it was before you
  pressed Continue, and Undo pops only the vertices you added during it. The
  other pieces stay on the map and stay in the list throughout, and holes already
  cut into the piece stay cut.

  Added: a vertex that carves the outline past a hole cannot be finished. The
  shape turns red as you draw and the map toolbar says the holes have to stay
  inside the piece, the same way a hole cut outside its piece is refused.

- Added: move, add and remove the vertices of a shape you have already finished.
  Edit vertices opens the piece on the map with every vertex it has, its holes'
  included. Drag one to move it, click an edge to put a new one between that
  edge's two ends, and press Delete to drop the vertex you last clicked. Finish
  puts the piece back where it was in the list, Cancel leaves it as it was, and
  Undo takes back one gesture at a time without eating into the piece you opened.
  It sits on the location panel at one piece and on each piece's row once there
  are more, beside Continue and Cut hole. A point is one vertex, so editing it
  moves that vertex.

  Added: an edit that leaves a ring with fewer than three vertices, or a line with
  fewer than two, cannot be finished. The shape turns red and the map toolbar asks
  for a vertex back, which any edge click gives it. So does an edit that pulls the
  outline in past a hole, which is refused the same way a redrawn outline already
  was.

- Added: cut a hole in an area you have drawn. Cut hole sits on the location panel
  at one piece and on each piece's row once there are more, so the piece a hole
  belongs to is the one you started from. A hole is a row under its piece and
  comes out on its own, leaving the piece behind.

  Added: a hole that runs outside the piece it is cut into cannot be finished. The
  shape turns red as you draw and the map toolbar names the piece the hole has to
  stay inside. So does a hole drawn out to the piece's own edge, which would leave
  the record covering no ground.

- Added: draw a record's geometry in several pieces. Add piece draws one more
  piece of the shape you already have, and the shape you drew first stays on the
  map while you place it. At two pieces the location panel lists them, and a row
  hovers to pick its piece out, clicks to frame it, and removes it. Removing the
  second-to-last piece puts the record back on a single shape. Redraw geometry
  still takes every piece.

  Changed: a form with nothing drawn yet opens on the area tool wherever the
  record can hold an area. Habitats, Inspections, the four control actions,
  Requested Control Actions and Mission Items opened on the point tool, so drawing
  the area started with a tool change.

  Changed: an edit form now opens a record whose geometry is already in several
  pieces, instead of showing it as no geometry and keeping what was stored unless
  you redrew the whole thing.

- Added: reshape a piece by sketching a line across its edge. Open a piece for
  editing, press Reshape, and click a line that crosses the edge at least twice.
  The stretch of edge between the first crossing and the last is replaced by the
  line, so a line drawn outside the piece pushes the edge out and one drawn inside
  pulls it in. Nothing asks which you meant: where the line runs is the answer.
  Double-click or Finish keeps the line, a second Finish puts the piece back at its
  place in the list, and Cancel leaves it as it was. The holes the piece already
  had ride through untouched. A line drawn on a line does the same thing to it.

  Added: a reshape that cannot be kept says so and draws red rather than refusing
  the gesture. A line that crosses the edge fewer than twice has no stretch to
  replace, a line that leaves a hole outside the piece is refused the way a redrawn
  outline already was, and a line that folds the edge back over itself leaves
  nothing of the piece. Undo takes back the line one click at a time and closes an
  empty one, so a Reshape pressed by mistake does not cost the edit.

  Fixed: an edit that leaves three corners on one straight line now says it leaves
  nothing of the piece. It could not be finished before either, and said nothing
  about why.

- Added: split a piece in two by sketching a line across it. Open a piece for
  editing, press Split, and click a line that runs in one side and out the other.
  The piece becomes two, divided along the line, and Finish puts both in the list
  where the one they replace was. Cancel leaves the piece as it was. A line drawn
  on a line cuts it into two lines.

  Added: holes survive the cut. A hole the line misses goes to the side it sits
  on. A hole the line crosses stops being a hole: each half of its ring becomes
  part of the edge of one piece, so the water is still out of the shape and is now
  a bay in each half rather than an island in one.

  Added: a split that cannot be kept says so and draws red rather than refusing the
  gesture. A line that stops inside the piece, or that would leave three pieces,
  has not divided it. A record that stores one shape and no multi shape has nowhere
  to put the second piece, and a Notification Registration says which shapes it
  stores rather than leaving the tool to do nothing.

- Added: a habitat's History card has a fourth tab, Requests, listing the requests
  for control raised against that habitat. The request form has always said a
  linked request shows on the habitat's history; now it does. Rows show when the
  request was raised, who raised it, what kind of control it asks for, its summary
  and whether it is still open. Resolved requests stay in the list, because the
  card answers what has happened at the site rather than what is left to plan.

- Added: a habitat's History card has a fifth tab, Source Reductions, listing the
  source reductions carried out at that habitat. Rows show the date, the
  technician, the method and how much was eliminated. Every one of them is listed:
  a source reduction is a record that the work happened, so there is no open or
  done state to filter on.

  Changed: History rows now link to the record they name, on all five tabs. The
  first cell of a row is the link, so a keyboard user gets one stop per row rather
  than one per cell. The tab strip scrolls sideways where five tabs do not fit.

- Added: fill a record's location from a file wherever that record holds a point.
  A Trap, an Address, a Collection, a Service Request and a Weather Source each get
  the File button beside the draw tool for the first time, and it reads a point out
  of a KML, KMZ or GeoJSON file the way it already read an area or a line. The
  dialog reads "Import a Point", and a file whose coordinates are not longitude and
  latitude is withheld with the same note an area gets.

  Added: a file holding several points under one feature comes in as one shape with
  a piece per point, on a record that stores several pieces. A record that holds a
  single point refuses it by name instead of leaving it out.

  Changed: a KML placemark that carries a label point beside its polygon is refused
  as mixed geometry, with a line saying so. It used to come in as the polygon alone.

- Changed: importing a file now makes one record per feature. A park on three
  separated lots comes in as one Region with three pieces, instead of three
  Regions named "Park A (1)", "Park A (2)" and "Park A (3)". Each preview row says
  how many pieces the feature holds and how many vertices, the preview map frames
  a multipart feature rather than failing to fit, and the 1000-feature cap now
  counts features, so the same number buys more file. A feature holding one lot
  imports as a plain area, exactly as before.

  Changed: the "Fill from File" shortcut on a record form now offers every shape
  that record can store, rather than only the shape the type toggle is on, and
  adopting one moves the toggle onto it. A record that takes areas and lines alike
  reads "Import a Geometry"; a Region import still reads "Import a Polygon".

  Changed: both import surfaces now say what they found and are not offering. A
  feature whose pieces the record cannot store, and a feature mixing geometry
  kinds, each get a line saying so instead of going missing without a word. A
  GeoJSON GeometryCollection is refused by name rather than dissolved into
  whichever shape came first.

  Fixed: filling a record's area from a Region boundary no longer refuses a Region
  drawn in separate pieces. It comes across whole wherever the record can store
  it, and is refused by name on a Notification Registration, which holds one area.

  Nothing is backfilled. An Organization that already imported a multi-lot file holds
  one Region per lot, and re-importing that file now produces one Region per
  feature beside them.

- Added: the Inspections table filters on date range, water, density, larvae
  found, habitat type and inspector. Each one narrows the query the server
  answers rather than hiding rows already loaded, and setting one takes the window
  back to its first page. The filters are the map explorer's, held in the same
  address, so a filtered link opens the same set on either surface. Set filters
  show as chips you can remove one at a time or clear together. The table offers
  no Region filter: region membership is a spatial question the server resolves,
  and the table's query can only ask about columns.

- Added: Inspections now has a Table beside its Map, at Larval Surveillance >
  Inspections > Table. It lists inspections newest first with the date, site,
  habitat type, inspector, water, density, dips, life stages and larvae, and a
  control on each row that opens the inspection. Load more extends the window;
  there are no page numbers, because counting the whole set would mean pulling it
  into the browser.

- Added: the Inspections table sorts on Date, Water, Dips and Larvae. A header
  reorders every inspection rather than the rows already loaded, and it takes the
  window back to its first page. The sort is in the address, so a sorted table
  survives a reload and is a link you can send. Site, Habitat type, Inspector and
  Density carry no sort control.

- Changed: a record's geometry can now be stored in several pieces. A Region takes
  a MultiPolygon, and Habitats, Inspections, the four control actions, Requested
  Control Actions and Mission Items take all six shapes, so a park on three
  separated lots is one Region and a treated area split by a road is one record.
  The Region filter reads a multipart record the way it reads a single one: two
  areas have to overlap, not merely share an edge. Drawing pieces comes next; this
  is the storage and the filter. A Notification Registration now takes a point or
  an area only, because two places are two Registrations.

- Changed: a person's name on the People page opens their Daily Work, so a row is a link as well as a Daily Work button.

- Changed: the Activity Monitor is gone, and Daily Work is where one person's field work is now read. Pick a name under Daily Work in the Overview sidebar, or open somebody's day from their row on the People page. A day at a time replaces the date range, and the person is in the address rather than in a picker.

- Added: the staging environment banner now sits above the signed-out pages too:
  the landing page, sign in, sign up, forgot and reset password, accept
  invitation, and the operations console's sign in. It says the deployment is a
  copy of the production system that the next refresh erases, and expands to say
  that sign-in details are the real production ones and that staging does not
  allow changes to sign-in accounts, Memberships, roles, Organizations, or
  invitations.
  Four of those pages are ones staging refuses, so the rule is now readable before
  the form is filled in. Production shows nothing.

- Changed: a weather station's summaries are listed a year at a time, one tab per
  year the station has readings in, newest first. A station logged daily for ten
  years put 3,650 rows in one table. Recording or editing a reading dated in
  another year moves the tabs to that year, so the reading you just saved is the
  one on screen.

  Added: the import screen names the column headings it reads before you choose a
  file, and marks the date column as the one it cannot do without. The headings
  come from the same list the parser matches against.

  Changed: the weather explorer filters by status, opening on active stations, and
  paints each station on the map by its status with a key beside it. The Active
  and Inactive pill has gone from the rows; the dot is the status now. This is the
  shape the Traps map already had.

  Changed: the Weather group's map is labelled "Map", matching every other map in
  the sidebar. The group heading above it already reads "Weather".

- Changed: the app no longer calls your Organization an agency. Not every customer
  is one: abatement districts, city and county programs, health departments,
  universities and contractors all run mosquito control, and the settings page has
  said Organization since it shipped while the copy around it said agency.

  Most of the strings did not need the noun and lost it. A catalog with nothing in
  it now reads "An owner or admin can add habitat types for you", the Outreach
  Methods page asks you to "Add the outreach methods you use", and the Collection
  Methods page describes "The trap types you run". Where the noun is the subject it
  says Organization: the sign-in screen, the general settings section, your
  profile's Organization card, and the conflict message when somebody else saves
  the same settings while you have them open.

  Two other fixes came with it. The four sheets on the settings page all say
  "Organization details are still loading." now, where two of them said agency.
  And the Contacts pages no longer call a member of the public an organization,
  which is the word for the body you work for: creating one reads "Add a person to
  the contact list", and the list describes "The people you engage with on service
  requests and notifications".

  Changed: the staging banner lists Organizations, not Agencies, among what
  staging refuses to change. The operations console shows the same banner.

### Patch Changes

- Changed: the dash a table draws where a record carries no value now announces
  itself as "Not recorded" to a screen reader. It used to name itself with a hover
  tooltip on the sixteen columns that went through a component, and with nothing
  at all on the twelve that wrote the character themselves, so the two apps read
  the same absence three different ways and one of them read out the punctuation.

  The twelve are four columns on a habitat's history, the inspector, applicator,
  dip and larvae counts; the custom fields a catalog row declares; a density
  badge with no reading; the route list's stop count; a route stop with no
  address; a trap collection with no date; the two weather summary readings; and
  the operator console's organization facts.

  Nothing looks different. The dash is the same mark in the same place, and a
  detail row still spells "Not recorded" out in words, because a row has room for
  them and a column repeating down a long list does not.

- Fixed: adding a stop to a mission with no name reads as a sentence again. A
  mission you have not named is listed by what it is and when it runs, so the
  add-stop screen was reading "Draw where the crew has to go on Source Reduction
  on Aug 4, 2026, 11:00 AM", with the preposition twice.

  The instruction and the mission are now two sentences. That screen reads "Draw
  where the crew has to go. This stop is for Source Reduction on Aug 4, 2026,
  11:00 AM", and a mission you have named reads "This stop is for Evening
  Fogging". How a mission with no name is listed has not changed.

- Fixed: the added date on a cleanup suggestion row is now the day the record was
  added on your Organization's calendar, not on the calendar of whoever opened the
  page. A contact added at 9pm read as the next day to a colleague a zone east,
  which is a difference you cannot see and a date two rows of a group get compared
  on. The same correction applies to the dates in the Service Request Activity
  panel on the Public Engagement overview, which were read in UTC.

- Fixed: clearing a search box now clears what it was narrowing. On the traps,
  habitats, addresses, regions, weather station and service request lists, and on
  the add-a-stop picker in the route editor, the X emptied the field and left the
  list filtered on the text that had just gone from the screen until the pause
  behind the field ran out.

  Fixed: three search boxes that had no clear control have one. The lookup
  catalogs, the contacts list, and the region picker that fills a shape from a
  boundary could only be emptied by selecting the text.

  Changed: every search box in the app draws the same way, and each one says what
  it searches to a screen reader. There were two versions of the box in the shared
  component library and six more copied by hand, and they had drifted in spacing,
  in whether the magnifier sat inside the frame, and in whether the box was named
  at all.

- Fixed: closing or reopening a Service Request no longer fails because your
  computer's clock is a little fast. The moment the browser stamps on the write
  was compared against the server's own clock with nothing allowed either way, so
  a machine running more than two seconds ahead had Close and Reopen refused as
  being in the future, with a message that gave no hint the clock was the reason.
  Marking a Mission Notification complete, failed, skipped or reopened refused for
  the same reason.

  Every other command in the product already allowed two minutes of ordinary
  device drift. Public engagement was the one place still holding a second copy of
  that rule, written before the allowance existed, and it now runs the same one.

- Fixed: a compact card is the same height above its title as below its last row.
  Forty-one cards drew 16px over the heading and 12px under the content, because
  the header's padding was typed at the call site and the body's came from a
  variant, and the two had drifted apart. Both halves now read one setting and
  both draw 12px, so the panels on the record detail pages, the profile page and
  the weather pages sit tighter and match top to bottom.

- Changed: the operator console no longer calls a customer an agency. Not every
  customer is one, and the console has always routed the directory at
  `/organizations` while the button above it read Create Agency.

  The section is Organizations now, from the sidebar label and the breadcrumb down
  to the directory heading, the create form, and the Organization id on a
  customer's detail page. The unlinked warning reads "1 organization is not linked
  to WorkOS, so nobody there can sign in", which also stops the same sentence using
  organization for two different things.

  Where the noun was doing no work it is gone. The global taxonomy and units pages
  say "Changes apply to everyone using this genus" and "will be removed for
  everyone", the foundations page offers "The first traps" and "Load the district
  boundaries from the KML, KMZ, or GeoJSON they sent", and the members list asks
  you to "Invite the first owner or admin below".

  Changed: deleting a species from the global taxonomy names what still cites it as
  an organization species list, not an agency species list. That count is what the
  refusal is counted from, so it is the sentence you read before confirming.

- Changed: nothing in either app says login. What a person signs in with is an
  Account, and two badges called it something else.

  In People, the line under a name is that Profile's email address, so it reads
  "No email" when there is none, which is what the operator console has said on
  the same line all along. In the console's member list, somebody who has been
  invited and has not arrived yet is "Never signed in" rather than "No login yet".

  Two quieter strings came with them. The sidebar falls back to Account when
  neither the Profile nor the Account carries a name, and the error you get when
  your Account has no active organization says that rather than naming you a user.

- Changed: no copy in either app joins a sentence with an em dash any more. It was
  in 62 strings, and it read the way a machine writes rather than the way anyone
  here talks.

  Most of it is form and catalog blurbs. A geometry field now says "The geometry is
  where the product was applied. Use a point for a spot treatment, a line or area
  for a treated swath." The five method catalogs introduce their examples the way a
  person would, and a role in the operator console reads "Manager, records and
  manages catalogs".

  Two of them a listener could not hear. The readiness list on an organization's
  foundations page announces "Region is in place." to a screen reader, where it
  used to announce a dash. One that joined a pair of values now uses the middle dot
  the rest of the line already uses, so a requested control action reads
  "Application requested · Check the culvert · Open".

  Four date ranges lose the spaces around their en dash, so a filter chip reads
  "Mar 3–Mar 9" the way a range is written.

  The dash a table draws where a record carries no value is untouched. That is a
  symbol, not a sentence.

- Fixed: renaming a custom field no longer empties that field on every record that
  already answered it.

  The custom-field editor on the method and habitat-type catalogs, and on the two
  My Organization pages, used to work out where a field's answers are stored from
  the field's name. Rename "Wing condition" to "Wing state" and the answers stayed
  where they were while the field went looking somewhere else, so every record read
  as if it had never answered. It happened on each keystroke, so saving mid-rename
  moved the field to a half-typed name.

  A field now keeps the place it stores answers for its whole life. Renaming it
  changes what it is called on screen and nothing else. A field somebody has just
  added still takes its storage from its name, and two fields whose names would
  agree still get separate places to store answers.

  Nothing was deleted, and an answer written before this fix is still on the
  record. Where a rename has already happened, that answer shows on the record's
  detail page under the old field name, marked Retired.

- Fixed: a date or an amount that will not render now shows the value that
  arrived instead of a dash, an "Unknown", or a blank page.

  Sixteen formatters answered a value they could not read in five different ways.
  Eight drew the em dash, which is the mark a column uses for a value the record
  does not carry, so a date column failing on every row read as a sparse record
  with nothing to say otherwise. Three answered "Unknown", which names the
  reader's problem rather than the record's. Four had no answer at all: the
  weekly strip on the larval and control overviews threw a "RangeError: Invalid
  time value" out of the render, which takes the page with it, and the day number
  under each weekday came out as "NaN".

  They all answer the same way now. The value goes on screen as it arrived, which
  is at least a clue to what is wrong with it, and a line naming the formatter and
  the value goes to the browser console for whoever is asked to fix it.

  Nothing changes for a date that reads. Every screen renders a real date and a
  real amount exactly as it did.

- Changed: every date and count in the app now reads the same
  whatever machine it is opened on. Fifty-six formatters named no locale, so each
  one inherited whatever the browser happened to be set to. A record dated
  "Aug 4, 2026" for one person read "4. Aug. 2026" for the person beside them with
  a different setting, and a count of 14,245 larvae read 14.245, which is a
  different number to anyone reading quickly. All of them now render as en-US,
  which is what the rest of the product was already written in, and what the other
  six formatters already pinned.

  Nothing else moves. Which day a record belongs to is still your Organization's
  zone, not the reader's, so a date is the day the work happened either way. The
  two formatters that pick a tag for its shape rather than for a reader are
  untouched: the one that writes a date column back as `YYYY-MM-DD`, and the one
  that fills a time field with a 24-hour `HH:MM`.

- Changed: a detail row with no value now reads "Not recorded" on every record
  page. It read a dash on addresses and your account, "Not set" on contacts,
  weather stations and traps, and a dash again on outreach, source reduction,
  biocontrol and adult collections, so the same absence had four spellings and two
  pages using the same word for different ones. Where a row means something more
  than "nothing", it still says which: Unassigned, None, Pending, Unfiled.

  Changed: a chemical application with no habitat reads "Standalone, no habitat"
  and an adult collection with no trap reads "Ad-hoc, no trap".

  Changed: labels on record detail pages sit in one column width. Sixteen pages had
  grown eight different ones, so two cards side by side started their values at
  different places.

- Fixed: finishing a piece you changed nothing on no longer counts as redrawing
  it, so Cancel is no longer the only exit that leaves the shape alone. Continue
  followed by Finish with no corner placed put the same outline back and marked
  the form as redrawn, which on a habitat asks for a permission collectors do not
  have and refused the whole save. Editing a piece and finishing it where it was
  did the same. What the shape becomes is compared against what it was, and the
  save only carries a location change when the two differ.

- Fixed: Enter typed into a field beside the map no longer finishes the shape you
  are drawing. The panel stays live while a draw is open, so an Enter meant to end
  a line in a description ended the outline instead, and put the half-drawn shape
  on the form. Enter now finishes only when it was not aimed at a field, which is
  the rule Delete already followed.

- Fixed: an edit page whose read failed now says so and tells you to try again,
  instead of saying the record could not be found. Six of them drew the "no such
  record" state whatever had happened: weather stations, missions, requests for
  control, assignments, trap routes and habitat routes. On those, a dropped
  connection looked like a record somebody had deleted, so the answer was to stop
  looking rather than to try again.

  Changed: a trap route, a habitat route and an assignment stand behind a
  placeholder while they load, rather than drawing an empty worklist, and say why
  they are unavailable in the same words every other record page uses.

- Fixed: picking a value from a dropdown beside the map no longer finishes the
  shape you are drawing. Enter on an open list chose the value and ended the
  outline in the same press, so every corner walked after it went nowhere. Enter
  that opens a dropdown does the same and no longer does either. Enter with the
  map itself in hand still finishes, on a draw, a hole, a continuation, an edit
  and a reshape line alike.

- Fixed: Escape no longer throws away an open boundary you are drawing when the
  key was meant for something else. A press in a field beside the map, and a press
  that closes a dropdown or a popover there, both leave the draft where it was.
  Escape with the map itself in hand still cancels. It cost a whole walked
  boundary in one press, on a draw, a hole, a continuation, an edit and a reshape
  line alike.

- Fixed: a record whose stored shape the map cannot draw now says so on its own
  Location card, naming the shape it holds and the shapes that field takes. Until
  now the geometry was handed to the map as-is, and the map dropped it without an
  error, so the card read as a record that had never been located. The check runs
  where the geometry is read, against the shapes the record's kind is allowed to
  store, and it draws nothing rather than failing the page.

- Fixed: editing a habitat without redrawing its shape no longer sends a location
  change, so a collector can now save a correction to a habitat's name,
  description, or metadata. The form decided the shape had moved by comparing two
  serialised copies of it, and a difference in key order was enough to make the
  save ask for a permission collectors do not have.

- Fixed: a note typed onto a habitat no longer reads as Retired. The custom fields
  list badges every key the schema does not declare, and on five of the six record
  kinds that badge is right, because those forms write only what their schema
  declares and a key outside it is a field that was dropped.

  The habitat form is the exception, and the only form in the app that lets
  somebody add a key its type never declared. Its own description says so: the
  fields this habitat type collects, plus any notes of your own. So the habitat
  detail page was badging each of those notes Retired, which tells a reader the
  value is historical when it is the one somebody just wrote.

  The list now takes the answer from the caller, because the entry cannot carry it:
  both cases arrive the same way. The habitat detail says its surface accepts extra
  keys and gets no badge; every other surface says nothing and is unchanged, badge
  included. A declared field with no value still reads Not recorded everywhere.

- Fixed: a KML placemark carrying a label point beside its shape imports again, as
  that shape, with the row saying the label point was dropped. It was refused as
  mixed geometry. A placemark mixing an area with a line, or holding several points
  beside a shape, is still refused.

- Fixed: importing a geometry from a file now counts one skipped shape in the
  singular. A file holding a single geometry this record cannot store used to read
  "1 other geometries were ignored", and it read that in both places the shape
  list says it, the sentence shown when nothing in the file is usable and the line
  beside the file name when something is. The badge next to that line had
  pluralised its own noun all along, so the two disagreed on the same screen.

- Fixed: moving between the Inspections Map and Table keeps the filters. Both
  surfaces now draw a Map/Table switch, and it carries what you have narrowed to
  with it. The switch carries the shared filters and not the table's sort, which
  the map has nothing to sort by. The sidebar's Map and Table links are unchanged
  and still open each surface on its own defaults.

- Fixed: the marker on a drawn line no longer moves once the record saves. It was
  placed at the average of the line's corners and stored at the middle of the
  line's length, so it jumped as far as the spacing was uneven. Lines with one long
  span, and multi-part lines with a short crowded part, moved the most.

- Fixed: keys now reach the map only when the map is the thing you are working in.
  Enter on a button beside the map finished the shape as well as pressing the
  button, Escape on one threw the whole draft away, and Delete or Backspace with a
  dropdown open took a corner off the shape being edited. The draw takes the map
  in hand when it opens, so Enter still finishes, Escape still cancels and Delete
  still removes the picked corner from the first press, on a draw, a hole, a
  continuation, an edit and a reshape line alike. Arrow-key panning works from the
  same moment, where it used to need a click on the map first.

- Fixed: the measure tool now answers Enter and Escape only when the map is the
  thing you are working in. Enter anywhere on the page finished the open
  measurement and Escape threw it away, including the Escape that closes a
  dropdown and the Enter that picks a value from one, so a measurement taken while
  reading the panel beside the map rarely survived. A line, a box and a circle all
  still finish on Enter and clear on Escape with the map in hand, and Finish and
  Clear are on the measure panel as before.

- Changed: the Location sentence on the biocontrol, chemical, source reduction, habitat and outreach forms is composed from the geometry register rather than written out five times. The shape it asks for now follows what the record may store, so a form for a record that keeps a point alone stops offering a line.

- Fixed: a save that fails now says so once. Fifteen record forms drew a second
  alert with the same heading as the first, so a refused save on a habitat, trap,
  collection, region, weather station, inspection, application, biocontrol
  release, source reduction, mission, request for control, contact, outreach
  action, service request or notification registration read "Unable to Save"
  twice, with the reason under the second copy.

  The form kit now catches the failure itself and puts it where a validation
  failure already goes, so both arrive in the one alert the form was drawing all
  along. Saving again after a failure works without touching a field first, which
  is what a save that failed on the network wants.

- Changed: page headings are one size across both consoles. Three heading
  treatments had grown at three declared sizes, so a catalog page, a record page
  and a domain overview each opened at a different weight of the same idea, and
  the catalog and cleanup pages, the inspections table and every console page sat
  a size below the rest. They all draw at the larger size now, from one component,
  and each carries the small label above the title that names the record type or
  the domain area.

- Fixed: a record page whose read failed now says so and tells you to try again,
  instead of saying the record could not be found. Seven pages read that failure
  and drew the "no such record" state anyway: contacts, addresses, source
  reduction actions, requests for control, service requests, larval inspections
  and samples. On those, a dropped connection looked like a record somebody had
  deleted or you had no access to.

  Fixed: the back link on a sample said "Back to samples()".

  Changed: a weather station reads at the same width as every other record page,
  and a habitat's placeholder now stands in the two columns the habitat actually
  loads into.

- Fixed: the bulk Region import now withholds shapes whose coordinates are not
  longitude and latitude, and says how many it withheld and to re-export the file
  as WGS84 (EPSG:4326). An export in State Plane feet or UTM metres parses as
  valid GeoJSON, so every polygon was offered, the preview map showed nothing, and
  pressing Import produced one failure line per region. This is the check the
  "fill geometry from a file" dialog already applied.

- Fixed: a Region drawn in more than one piece now saves. Create refused it with
  "Draw the region boundary before saving." while the pieces were on the map in
  front of you, and an edit that added a piece saved the name and the folder and
  kept the boundary it loaded, with nothing on screen to say the redraw had been
  dropped. Importing a multipart Region was already correct.

- Fixed: raising, editing or closing out a request for control now needs your
  profile in hand, so a request always names who asked and who settled it.

- Fixed: selection is one colour on every map. A selected record wore an amber
  halo on the explorer layers, dark green on a record's own detail map, and
  near-black on the service-request map, so the same record read as a different
  state depending on which map you clicked it from. It is amber everywhere now, as
  it is on the shape you are drawing.

  Four colours settled with it. A route stop that is retired paints the same grey
  a retired habitat does, and an inaccessible stop the same red, instead of a
  shade of each that only the route map used. A record's own geometry on its
  detail map paints the green its explorer paints, so the shape does not change
  colour when you open it. The service request at the centre of its nearby map now
  wears its own outreach mark and the radius around it reads as ground rather than
  as another amber thing on the map.

- Changed: a Tag chip, a Route link and a species count now wait for the catalog row that names them instead of drawing "Unknown tag", an unnamed link, or "Unknown species" for the frame before it arrives.

- Changed: the copy that said site now names the record or drops the noun. Site
  reads as a habitat to one person and a trap to the next, and a column header is
  the worst place for it, because a reader takes a header as the name of the thing
  in the column.

  The Inspections table's second column is headed Habitat, which is what the
  inspection detail page already calls the same value. Habitat Types counts Active
  Habitats, which is what the server aggregate behind it returns. The Habitat
  Types page classifies habitats rather than larval sites, and a route stop's
  description asks what crews should know about this habitat.

  The form hints lost the word too. Drawing a habitat is a point for a single one,
  a service request is a point for a single spot, a mission stop is a point for one
  spot, and source reduction is a point for a single source. On the three control
  forms the habitat is the one the release was performed against, the treatment was
  applied to, or the work was done at.

  "Site visits" on Outreach Methods and "No standing water found on site" on a
  service request are ordinary English, not the term, and are untouched.

- Fixed: the colour dot on an explorer row no longer paints a hover tooltip. On
  the surfaces that dropped their status pill the dot is the only thing saying
  whether a record is active or out of reach, and it carried both a label for a
  screen reader and a `title` repeating the same word, so the dot announced
  itself twice. The label stays and the tooltip is gone.

- Fixed: clearing a trap's name on a trap that has no code is now refused, with a
  message saying a trap needs a name or a code. The rule was read against the
  fields an edit happened to name, and an edit that clears the name sends only
  that column, so the check ran only on the edits that moved the name and the code
  together. Clearing one at a time saved a trap carrying neither, which then drew
  with nothing to read it back under.

  The rule now runs against the trap as the edit will leave it, so a name can
  still be cleared on a trap that keeps a code, and an edit to the description
  alone is unaffected.

- Changed: the upcoming pages name a habitat or a trap where they used to say
  site. Site reads as a habitat to one person and a trap to the next, so the copy
  now writes whichever record the surface actually holds.

  The Habitats link says "The habitats you inspect, on the map" and the Traps link
  says "Traps and their collection methods, on the map". Habitat Statistics asks
  which habitats come back positive and counts coverage of the habitats nothing
  has been logged against; Trap Statistics asks which traps are carrying the
  program. Biocontrol is habitats on both surfaces: releases are logged by method,
  amount and habitat, and the statistics page reads the method mix beside the
  habitats released into.

- Fixed: the two cleanup pages and the habitat merge now refuse a role below manager before the page loads, instead of letting one fill the whole merge in and be refused at the save. Every write surface reads its role floor from one register, so a form's floor is the same fact the sidebar filters on and the server enforces.

## 0.6.1 — 2026-09-01

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
