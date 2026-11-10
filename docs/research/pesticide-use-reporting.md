# What pesticide-use reporting rules require per product

Research for #1738, under the map #1733 (Treatment above Chemical Application). The question
for #1734 is whether a Chemical Application line needs its own location, area or site count, or
whether those can live only on the Treatment.

## Answer

Every rule read here keys its record to the application (the job), and inside that record it
names each product separately. Product identity (brand name and EPA registration number) and
amount are per product everywhere. Location, date, applicator and area treated are written once
per application in every rule, and no rule asks for a location or area per product. The
monthly summary reports that California and Florida mosquito programs file are a third shape:
one row per product per month, with a count of applications and, in California's general rule,
acres or units per product.

So a line needs the product, its EPA registration number and its amount. Location and area can
sit on the Treatment. The one per-product area figure any rule asks for is California's monthly
summary total of acres or units "treated with each pesticide", and for a tank mix that is the
Treatment's area repeated on each product, which a report can derive.

No rule read here says anything explicit about tank mixes. New Jersey comes closest: its
record holds one place and one total mixture per application, plus a "recipe" naming the
concentrate amount of each pesticide in it.

## Per source

| Source | Record unit | Per product | Once per application |
| --- | --- | --- | --- |
| 7 CFR 110.3 (USDA, restricted use) | Each RUP application | Brand name, EPA reg. no., total amount | Location, area treated, crop or site, date, applicator |
| 40 CFR 171.303(b)(7)(vi) (EPA, state plans, restricted use) | Each application | Brand name, EPA reg. no., total amount "per location per application" | Customer, location, size of area, site, time and date, applicator |
| 3 CCR 6624 (California records) | Each pest control operation | Pesticide, EPA or state reg. no., amount | Date and time, location, site, acreage or units |
| 3 CCR 6627 (California monthly summary) | Product per county per month | Product, reg. no., amount, number of applications, acres or units | County, month |
| CDPH cooperative agreement (California vector control) | Each application (record); product per county per month (report) | Formulation and amount; on the report, product, reg. no., amount, applications | Target vector, location, size of the source, method, equipment, habitat, date, applicator |
| N.J.A.C. 7:30-6.8 (New Jersey commercial) | Each application | Brand name, active ingredients, EPA reg. no., concentrate amount in the recipe | Date, address, site, diluent, total mixture, area when the label rate is per area, applicator |
| ECL 33-1205 (New York commercial) | Each application, reported annually | EPA reg. no., product name, quantity of each pesticide | Date, address with zip code; dosage rate, method and target kept annually |
| 5E-13.040(8) and 5E-13.027 (Florida mosquito control) | Each pesticide use (record); monthly activity report | Pesticide and amount, application rate | Applicator, method, location, date and time, surveillance justifying an adulticide |

### Federal: USDA and EPA restricted-use records

7 CFR 110.3(a) requires a record of each restricted use pesticide application holding the brand
or product name and EPA registration number of the RUP applied, the total amount applied, the
location, the area treated and the crop, commodity, stored product or site, the date, and the
applicator's name and certification number. The part covers "all certified applicators, both
private applicators and commercial applicators" (7 CFR 110.1). 110.3(b) lets same-day
applications under one tenth of an acre in total be recorded as a "spot application" with a
short description of location and treatment. The text says nothing about tank mixes.
[7 CFR 110.3](https://www.law.cornell.edu/cfr/text/7/110.3),
[7 CFR 110.1](https://www.law.cornell.edu/cfr/text/7/110.1)

40 CFR 171 puts no application record on certified applicators directly; 171.201(e) is only the
qualification record for noncertified applicators working under supervision. It requires state
certification plans to make certified commercial applicators keep, for two years, the customer,
location, size of the area treated, site, time and date, brand or product name, EPA
registration number, "total amount applied per location per application", and the applicator.
[40 CFR 171.303(b)(7)(vi)](https://www.law.cornell.edu/cfr/text/40/171.303),
[40 CFR 171.201](https://www.law.cornell.edu/cfr/text/40/171.201)

Both rules reach only restricted use products. A general use product is held only by the state
rules below.

### California

3 CCR 6624(b) requires, for every pest control operation, the date and time, the operator of the
property, the location, the crop, commodity or site, the total acreage or units treated, and
"the pesticide, including the U.S. EPA or state registration number", and the amount used. It
has no public health exemption and no tank-mix wording.
[3 CCR 6624](https://www.law.cornell.edu/regulations/california/3-CCR-6624)

Non-production uses report on the monthly summary under 3 CCR 6627: name and address, county,
month and year, site (or a use code), each pesticide product with its registration number and
amount, the number of applications of each pesticide and the month's total, and the total acres
or units treated with each pesticide (unless a use code is used). The only location is the
county.
[3 CCR 6627](https://www.law.cornell.edu/regulations/california/3-CCR-6627)

Vector control agencies report through the same monthly summary. A 1995 MOU between DPR, the
then Department of Health Services and the county agricultural commissioners routes "all
pesticide use reports for vector control" to the counties on the monthly summary form,
including districts under a cooperative agreement with the health department (DPR enforcement
letter ENF 07-20, July 2007).
[DPR ENF 07-20](https://www.cdpr.ca.gov/?p=7259)

The cooperative agreement under Health and Safety Code 116180 is where the vector control
specifics are. In the 2025 agreement between CDPH and the Santa Cruz County Mosquito and Vector
Control District, the agency agrees to keep for two years "a record of each pesticide
application showing the target vector, the specific location treated, the size of the source,
the formulations and amount of pesticide used, the method and equipment used, the type of
habitat treated, the date of the application, and the name of the applicator(s)", and to file a
monthly report on DPR form PR-ENF-060 with "the manufacturer and product name, the EPA
registration number from the label, the amount of each pesticide used, the number of
applications of each pesticide, and the total number of applications, per county, per month".
The monthly report has no area column in the agreement's wording; the per-application record
has one size of source, not one per formulation.
[CDPH cooperative agreement, Santa Cruz 2025](https://mvc.santacruzcountyca.gov/portals/31/mvc/Documents/2025CooperativeAgreement.pdf)

### New Jersey

N.J.A.C. 7:30-6.8(a) is the commercial applicator record, written within 24 hours and kept three
years. Per application it holds the date (with the hour when the label has an REI), "the
specific address, municipality and county", the brand or trade name, active ingredients and
EPA registration numbers "of each pesticide used", the "recipe" used to mix the pesticide (the
total amount of pesticide concentrate and the total amount of diluent), "the total amount of
pesticide mixture used for each individual application", the size of the area treated "when a
rate per given area is specified on the label", the applicator's name and license number, and
the site of application. Aquatic applications under a permit keep records under 7:30-9.3(j)
instead, on the state's Record of Actual Treatment form, and 7:30-9.3(b)2 exempts mosquito and
fly control by a lead agency under N.J.S.A. 26:9 from that permit.
[N.J.A.C. 7:30-6.8](https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-7-30-6-8),
[N.J.A.C. 7:30-9.3](https://www.law.cornell.edu/regulations/new-jersey/N-J-A-C-7-30-9-3)

This is the closest thing to a tank-mix rule in any source here. The record is one per mixture
application: one place, one diluent figure, one total mixture, one area. The products in it are
listed by name and registration number, each with its own concentrate amount.

New Jersey has no routine annual use report. DEP runs a mosquito control use survey every few
years, under the rule that applicators keep records and "submit use records to the state when
requested".
[NJDEP mosquito control pesticide use survey, 2016](https://www.nj.gov/dep/enforcement/pcp/bpo/pem/surveys/mos2016.pdf)

### New York

ECL 33-1205(1) requires commercial applicators to keep, for each application, the EPA
registration number, product name, "quantity of each pesticide used", date applied and
"location of application by address (including five-digit zip code)", plus "corresponding
records of the dosage rates, methods of application and target organisms" on an annual basis.
They report this to DEC by February 1 for the prior year. The statute has no mosquito or public
health exemption. DEC's 1998 policy OGC 3 adds a "place" field for a location finer than the
address and does not require a separate "use" field. Neither source mentions tank mixes.
[ECL 33-1205](https://newyork.public.law/laws/n.y._environmental_conservation_law_section_33-1205),
[DEC OGC 3](https://dec.ny.gov/regulatory/guidance-and-policy-documents/ogc-3-pesticide-recordkeeping-and-reporting-of-commercial-applicators)

### Florida

5E-13.040(8) requires public health pest control applicators to record, for each pesticide use,
the applicator, the pesticide and amount used, the method, the location, the application rate,
the date and time, and the surveillance method and data that justified any adulticide
application. Records are kept three years. It names no EPA registration number, target pest or
acres, and says nothing about mixtures.
[5E-13.040](https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-5E-13-040)

State approved programs also file a monthly pesticide activity report on FDACS-13652 within 30
days of month end (5E-13.027). The rule defers the layout to the form, which I could not
retrieve.
[5E-13.027](https://www.law.cornell.edu/regulations/florida/Fla-Admin-Code-Ann-R-5E-13-027)

## What this means for #1734

- **Per line:** product, EPA registration number (it comes with the product), and amount. Every
  source asks for these per product.
- **Per Treatment:** date and time, applicator, location, area treated or size of source, site
  or habitat, method and equipment, target. Every source records these once per application,
  and none asks for a location per product.
- **Monthly summaries** (California, Florida) are aggregates by product. They need the number
  of applications per product, which is the number of Treatments holding a line for that
  product, and in California's general rule the acres or units per product, which is the sum of
  the areas of those Treatments.
- **Rate** is the one figure that could vary by product inside one job. Florida records an
  application rate and New York a dosage rate. Each is derivable from the line's amount and the
  Treatment's area, so it does not force a per-line area.
- **New Jersey's recipe** records a concentrate amount per product and one diluent and one total
  mixture per application. If a line's amount is concentrate, the Treatment carries diluent and
  total mixture; that is a Formulation question for the form design, not a location question.

## Gaps

- The FDACS-13652 form layout and the current DPR PR-ENF-060 form were not retrievable, so the
  exact columns of the Florida and California monthly reports are from the rule and agreement
  text, not the forms.
- The CDPH agreement read is one district's 2025 copy. It looks like a statewide template, but
  it was not checked against a second agency's copy.
- The DPR vector control routing rests on a 2007 letter citing a 1995 MOU. The 2025 cooperative
  agreement's reference to PR-ENF-060 is consistent with it still applying.
- No source found states a rule for adjuvants or for recording a tank mix as one line versus
  several.
