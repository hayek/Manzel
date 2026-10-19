const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every { in styles.css has a matching }', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let line = 1;
  const open = [];
  for (const ch of css) {
    if (ch === '\n') line++;
    if (ch === '{') { depth++; open.push(line); }
    if (ch === '}') { depth--; open.pop(); }
    assert.ok(depth >= 0, `unexpected } near line ${line}`);
  }
  assert.deepEqual(open, [], `unclosed { opened near line(s) ${open.join(', ')}`);
});
