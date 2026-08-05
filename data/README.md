# Bearing Fit Data Validation

This folder contains the formal bearing-fit dataset schema and validation fixtures for the MillwrightIQ bearing fit dataset architecture.

## Freeze status
- Schema v1.0.0 is frozen.
- Placeholder datasets are for development only.
- Production recommendations require verified engineering source data.
- Future schema changes must be backward compatible or use Schema v2.

## What this validates

The validator ensures the bearing-fit JSON schema compiles successfully and that sample dataset fixtures conform to the schema.

It validates:
- the formal schema shape for manufacturer datasets and ISO fallback data,
- required metadata, versioning, and provenance fields,
- enum values for bearing types, rotation, application class, fit targets, and installation methods,
- numeric ranges such as confidence `0..100`, positive diameters, and ISO date-time formats,
- no additional properties where `additionalProperties: false` is declared.

## Where the files live

- Schema: `data/schema/bearing-fit-schema.v1.json`
- Valid fixture: `data/fixtures/bearing-fit-valid.json`
- Invalid fixture: `data/fixtures/bearing-fit-invalid.json`
- Validator script: `scripts/validate-bearing-fit-schema.js`

## How to run

```bash
node scripts/validate-bearing-fit-schema.js
```

## Expected result

A successful run should report:
- AJV version
- schema compile `OK`
- valid fixture `OK`
- invalid fixture `OK (invalid fixture rejected)`
- custom validation success for the valid fixture

A nonzero exit means one of these conditions failed:
- schema compilation failed,
- valid fixture failed validation,
- invalid fixture unexpectedly passed,
- custom validation found issues in the valid fixture,
- invalid fixture lacked expected custom validation failures.

## Custom validator rules

The validator includes custom checks for rules that are easier to enforce outside JSON Schema:
- `boreMinMM <= boreMaxMM`
- every interference interval `min <= max`
- nominal bore values fall inside the manufacturer coverage range
- referenced row IDs exist and are unique within a manufacturer
- tolerance row coverage stays within declared source coverage
- confidence values are integer `0..100`

## Warning

The fixture values are illustrative only. They are not authoritative manufacturer fit data and should not be used for production recommendations.

## Next planned step

- create placeholder datasets for deep-groove ball, cylindrical roller, and tapered roller bearings,
- validate them against the schema,
- do not use them for production recommendations until authoritative source data is added.
