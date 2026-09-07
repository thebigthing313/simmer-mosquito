---
'@simmer-mosquito/web': patch
'@simmer-mosquito/admin': patch
---

Changed: the dash a table draws where a record carries no value now announces
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
