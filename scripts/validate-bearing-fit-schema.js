const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'data', 'schema', 'bearing-fit-schema.v1.json');
const validFixturePath = path.join(root, 'data', 'fixtures', 'bearing-fit-valid.json');
const invalidFixturePath = path.join(root, 'data', 'fixtures', 'bearing-fit-invalid.json');
const placeholderPaths = [
  path.join(root, 'data', 'placeholders', 'deep-groove-ball-template.json'),
  path.join(root, 'data', 'placeholders', 'cylindrical-roller-template.json'),
  path.join(root, 'data', 'placeholders', 'tapered-roller-template.json'),
  path.join(root, 'data', 'placeholders', 'generic-engineering-recommendation-template.json')
];

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validFixture = JSON.parse(fs.readFileSync(validFixturePath, 'utf8'));
const invalidFixture = JSON.parse(fs.readFileSync(invalidFixturePath, 'utf8'));
const placeholders = placeholderPaths.map((p) => ({ path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }));

function findRefs(obj, refs = new Set()) {
  if (Array.isArray(obj)) {
    obj.forEach((item) => findRefs(item, refs));
    return refs;
  }
  if (obj && typeof obj === 'object') {
    if (typeof obj.$ref === 'string') {
      refs.add(obj.$ref);
    }
    Object.values(obj).forEach((value) => findRefs(value, refs));
  }
  return refs;
}

function normalizeRef(ref) {
  if (typeof ref !== 'string') return null;
  return ref.startsWith('#/$defs/') ? ref.slice('#/$defs/'.length) : ref;
}

function collectDefs(schema) {
  return schema.$defs ? Object.keys(schema.$defs) : [];
}

function collectInternalRefs(schema) {
  const refs = findRefs(schema);
  return new Set([...refs].map(normalizeRef).filter(Boolean));
}

function printErrors(errors) {
  if (!errors) return;
  errors.forEach((error) => {
    const path = error.instancePath || '/';
    console.error(`- ${path}: ${error.message} (${error.schemaPath})`);
  });
}

function runCustomChecks(data) {
  const issues = [];

  const collectRowIds = () => {
    const ids = new Map();
    if (!Array.isArray(data.manufacturers)) return ids;
    data.manufacturers.forEach((manufacturer, mIdx) => {
      if (!Array.isArray(manufacturer.toleranceTable)) return;
      manufacturer.toleranceTable.forEach((row, rIdx) => {
        if (row && row.id) {
          const key = `${mIdx}:${row.id}`;
          if (ids.has(key)) {
            issues.push(`manufacturers[${mIdx}].toleranceTable[${rIdx}].id '${row.id}' is duplicated within the manufacturer`);
          } else {
            ids.set(key, row);
          }
        }
      });
    });
    return ids;
  };

  const rowIds = collectRowIds();

  const validateCoverage = (coverage, location) => {
    if (!coverage) return;
    if (typeof coverage.boreMinMM === 'number' && typeof coverage.boreMaxMM === 'number') {
      if (coverage.boreMinMM > coverage.boreMaxMM) {
        issues.push(`${location}.coverage: boreMinMM (${coverage.boreMinMM}) > boreMaxMM (${coverage.boreMaxMM})`);
      }
    }
  };

  const validateInterference = (item, context) => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.min === 'number' && typeof item.max === 'number') {
      if (item.min > item.max) {
        issues.push(`${context}: min (${item.min}) > max (${item.max})`);
      }
    }
  };

  const validateNominalBores = (coverage, location) => {
    if (!coverage || !Array.isArray(coverage.nominalBoreValuesMM)) return;
    coverage.nominalBoreValuesMM.forEach((value) => {
      if (typeof value !== 'number') return;
      if (typeof coverage.boreMinMM === 'number' && value < coverage.boreMinMM) {
        issues.push(`${location}.coverage: nominal bore ${value} is below boreMinMM ${coverage.boreMinMM}`);
      }
      if (typeof coverage.boreMaxMM === 'number' && value > coverage.boreMaxMM) {
        issues.push(`${location}.coverage: nominal bore ${value} is above boreMaxMM ${coverage.boreMaxMM}`);
      }
    });
  };

  if (Array.isArray(data.manufacturers)) {
    data.manufacturers.forEach((manufacturer, mIdx) => {
      const manufacturerPath = `manufacturers[${mIdx}]`;
      validateCoverage(manufacturer.coverage, manufacturerPath);
      validateNominalBores(manufacturer.coverage, manufacturerPath);

      if (Array.isArray(manufacturer.toleranceTable)) {
        manufacturer.toleranceTable.forEach((row, rIdx) => {
          const rowPath = `${manufacturerPath}.toleranceTable[${rIdx}]`;
          if (typeof row.boreMinMM === 'number' && typeof row.boreMaxMM === 'number' && row.boreMinMM > row.boreMaxMM) {
            issues.push(`${rowPath}: boreMinMM (${row.boreMinMM}) > boreMaxMM (${row.boreMaxMM})`);
          }
          if (typeof manufacturer.coverage?.boreMinMM === 'number' && typeof row.boreMinMM === 'number' && row.boreMinMM < manufacturer.coverage.boreMinMM) {
            issues.push(`${rowPath}: boreMinMM (${row.boreMinMM}) is outside manufacturer coverage min ${manufacturer.coverage.boreMinMM}`);
          }
          if (typeof manufacturer.coverage?.boreMaxMM === 'number' && typeof row.boreMaxMM === 'number' && row.boreMaxMM > manufacturer.coverage.boreMaxMM) {
            issues.push(`${rowPath}: boreMaxMM (${row.boreMaxMM}) is outside manufacturer coverage max ${manufacturer.coverage.boreMaxMM}`);
          }
          if (Array.isArray(row.recommendedFits)) {
            row.recommendedFits.forEach((fit, fIdx) => {
              const fitPath = `${rowPath}.recommendedFits[${fIdx}]`;
              validateInterference(fit.recommendedInterference_um, `${fitPath}.recommendedInterference_um`);
              validateInterference(fit.interferenceAtAssembly_um, `${fitPath}.interferenceAtAssembly_um`);
              if (typeof fit.confidence === 'number' && !Number.isInteger(fit.confidence)) {
                issues.push(`${fitPath}.confidence must be an integer`);
              }
              if (typeof fit.confidence === 'number' && (fit.confidence < 0 || fit.confidence > 100)) {
                issues.push(`${fitPath}.confidence ${fit.confidence} is outside 0..100`);
              }
            });
          }
        });
      }
    });
  }

  return issues;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema, 'bear-fits');

const defsDeclared = collectDefs(schema);
const defsReferenced = Array.from(collectInternalRefs(schema));
const defsUnreferenced = defsDeclared.filter((def) => !defsReferenced.includes(def));

let pass = true;

console.log('AJV version:', require('ajv/package.json').version);
console.log('Schema compile:');
try {
  ajv.compile(schema);
  console.log('  OK');
} catch (err) {
  pass = false;
  console.error('  FAILED: schema failed to compile');
  if (err.errors) printErrors(err.errors);
  else console.error(err);
}

if (defsUnreferenced.length > 0) {
  pass = false;
  console.error('Unreferenced $defs:', defsUnreferenced.join(', '));
}

console.log('Valid fixture:');
const validResult = ajv.validate(schema, validFixture);
if (validResult === true) {
  console.log('  OK');
} else {
  pass = false;
  console.error('  FAILED: valid fixture did not pass');
  printErrors(ajv.errors);
}

console.log('Invalid fixture:');
const invalidResult = ajv.validate(schema, invalidFixture);
if (invalidResult === false) {
  console.log('  OK (invalid fixture rejected)');
  printErrors(ajv.errors);
} else {
  pass = false;
  console.error('  FAILED: invalid fixture unexpectedly passed');
}

console.log('Placeholder templates:');
placeholders.forEach((placeholder) => {
  const displayPath = path.relative(root, placeholder.path);
  const result = ajv.validate(schema, placeholder.data);
  if (result === true) {
    console.log(`  ${displayPath}: OK`);
  } else {
    pass = false;
    console.error(`  ${displayPath}: FAILED`);
    printErrors(ajv.errors);
  }
});

console.log('Custom validation:');
const customIssuesValid = runCustomChecks(validFixture);
const customIssuesInvalid = runCustomChecks(invalidFixture);
if (customIssuesValid.length === 0) {
  console.log('  Valid fixture passed custom checks');
} else {
  pass = false;
  console.error('  Valid fixture custom check failures:');
  customIssuesValid.forEach((issue) => console.error(`  - ${issue}`));
}
if (customIssuesInvalid.length > 0) {
  console.log('  Invalid fixture custom checks detected issues:');
  customIssuesInvalid.forEach((issue) => console.log(`  - ${issue}`));
} else {
  pass = false;
  console.error('  INVALID fixture passed custom checks unexpectedly');
}

process.exit(pass ? 0 : 1);
