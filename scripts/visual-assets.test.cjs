const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('English catalog screenshot is a nonempty PNG', () => {
  const screenshot = fs.readFileSync(path.join(__dirname, '../assets/screenshot-en.png'));
  assert.deepEqual(screenshot.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.ok(screenshot.readUInt32BE(16) >= 640);
  assert.ok(screenshot.readUInt32BE(20) >= 360);
});
