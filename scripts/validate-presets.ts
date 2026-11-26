// Validates every released composition/preset and its content fixtures.
// Fails closed: any unexpected template, orientation, region problem or fixture
// that does not satisfy the display contract stops a release.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compositions, validateComposition } from '../packages/templates/src/layouts.ts';
import { pointLimits, templateIds, parseDisplaySnapshot } from '../packages/contracts/src/display.ts';
import { fixtures } from '../fixtures/snapshots.ts';

const failures: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const orientations = ['portrait', 'landscape'] as const;
const expected = new Set<string>();
for (const id of templateIds) for (const orientation of orientations) expected.add(`${id}:${orientation}`);

const actual = new Set(Object.keys(compositions));
for (const key of expected) check(actual.has(key), `Missing composition ${key}`);
for (const key of actual) check(expected.has(key), `Unexpected composition ${key}`);

for (const [key, layout] of Object.entries(compositions)) {
  const [id, orientation] = key.split(':');
  check(layout.orientation === orientation, `${key}: declared orientation does not match key`);
  const issues = validateComposition(layout);
  for (const issue of issues) failures.push(`${key}: ${issue}`);
  check(layout.regions.some(r => r.role === 'main'), `${key}: missing main region`);
  check(layout.regions.some(r => r.role === 'disclosure'), `${key}: missing disclosure region`);
  check(templateIds.includes(id as typeof templateIds[number]), `${key}: unknown template id`);
}

// Every fixture must parse and stay within the per-composition capacity bounds.
check(fixtures.length === templateIds.length * 2 * 3, `Expected ${templateIds.length * 2 * 3} fixtures, found ${fixtures.length}`);
for (const snapshot of fixtures) {
  let parsed;
  try { parsed = parseDisplaySnapshot(snapshot); }
  catch (error) { failures.push(`Fixture ${snapshot.templateId}:${snapshot.orientation} rejected: ${(error as Error).message}`); continue; }
  const limit = pointLimits[parsed.templateId];
  check(parsed.content.points.length <= limit.count, `${parsed.templateId}:${parsed.orientation} exceeds point count limit`);
  for (const point of parsed.content.points) check(Array.from(point).length <= limit.chars, `${parsed.templateId}:${parsed.orientation} exceeds point character limit`);
}

// Optional on-disk presets (safe areas, transitions) carry provenance metadata.
const presetsRoot = 'presets';
if (existsSync(presetsRoot)) {
  for (const entry of readdirSync(presetsRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const path = join(presetsRoot, entry.name);
    let manifest: unknown;
    try { manifest = JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) { failures.push(`${path}: invalid JSON (${(error as Error).message})`); continue; }
    const record = manifest as Record<string, unknown>;
    check(typeof record.source === 'string' && !!record.source.trim(), `${path}: missing source provenance`);
    check(typeof record.reviewDate === 'string' && !Number.isNaN(Date.parse(record.reviewDate)), `${path}: missing review date`);
    check(typeof record.platformVersion === 'string' && !!record.platformVersion.trim(), `${path}: missing platform/app version`);
    check(record.verified === true, `${path}: unverified margins must not be released as official`);
    const serialized = JSON.stringify(manifest);
    check(!/https?:\/\//i.test(serialized), `${path}: preset must not reference external URLs`);
    check(!/(api[_-]?key|secret|password|token["']?\s*[:=])/i.test(serialized), `${path}: preset must not embed credentials`);
  }
}

if (failures.length) {
  console.error(`Preset validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`Preset validation passed: ${expected.size} compositions, ${fixtures.length} fixtures.`);
