---
'@simmer-mosquito/web': patch
---

Fixed: a save that fails now says so once. Fifteen record forms drew a second
alert with the same heading as the first, so a refused save on a habitat, trap,
collection, region, weather station, inspection, application, biocontrol
release, source reduction, mission, request for control, contact, outreach
action, service request or notification registration read "Unable to Save"
twice, with the reason under the second copy.

The form kit now catches the failure itself and puts it where a validation
failure already goes, so both arrive in the one alert the form was drawing all
along. Saving again after a failure works without touching a field first, which
is what a save that failed on the network wants.
