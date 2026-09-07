---
'@simmer-mosquito/web': patch
---

Fixed: a date or an amount that will not render now shows the value that
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
