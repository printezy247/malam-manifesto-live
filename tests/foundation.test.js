import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('workspace exposes real deterministic verification stages', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(manifest.private, true);
  assert.deepEqual(manifest.workspaces, ['apps/*', 'packages/*']);
  for (const name of ['test', 'typecheck', 'lint', 'build', 'check']) {
    assert.equal(typeof manifest.scripts[name], 'string');
    assert.ok(manifest.scripts[name].trim());
    assert.doesNotMatch(manifest.scripts[name], /echo|exit 0/);
  }
  assert.match(manifest.scripts.check, /npm test.*npm run typecheck.*npm run lint.*npm run build/);
});
