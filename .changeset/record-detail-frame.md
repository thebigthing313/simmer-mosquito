---
'@simmer-mosquito/web': patch
---

Fixed: a record page whose read failed now says so and tells you to try again,
instead of saying the record could not be found. Seven pages read that failure
and drew the "no such record" state anyway: contacts, addresses, source
reduction actions, requests for control, service requests, larval inspections
and samples. On those, a dropped connection looked like a record somebody had
deleted or you had no access to.

Fixed: the back link on a sample said "Back to samples()".

Changed: a weather station reads at the same width as every other record page,
and a habitat's placeholder now stands in the two columns the habitat actually
loads into.
