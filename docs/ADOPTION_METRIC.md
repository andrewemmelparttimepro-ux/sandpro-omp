# SandPro OMP onboarding adoption

The daily operating inspection uses one canonical adoption metric so changes in
the roster or matching quality are not mistaken for product movement.

## Canonical metric

`roster-matched employees with a non-null auth.users.last_sign_in_at`
divided by
`roster rows matched to a live human profile`.

Every report must state all of the following beside the percentage:

- the roster filename and as-of date;
- total employee rows in that roster;
- the matched live-human denominator;
- the signed-in numerator;
- every unmatched roster name;
- the number and definition of excluded QA, service, duplicate, or non-human profiles;
- the exact evidence cutoff and timezone.

The total roster row count is a reconciliation control, not the adoption
denominator. A new employee, corrected name match, excluded QA account, or newer
roster creates a denominator change and must be labeled as such. A number with a
different denominator must not be presented as an adoption trend.
