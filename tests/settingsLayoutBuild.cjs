// Verify the optimized asset: CSS shorthand optimization previously renamed
// the `columns` export, although the source and type declarations looked valid.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const folder = 'sharepoint/solution/debug/ClientSideAssets';
const filename = fs.readdirSync(folder).find(name => /^helpdesk-system-web-part_.*\.js$/.test(name));
assert(filename, 'Run npm run build first');
const bundle = fs.readFileSync(path.join(folder, filename), 'utf8');
const mapping = /(?:settingsSplitLayout|className):"(settingsSplitLayout_[a-z0-9]+)"/.exec(bundle);
assert(mapping, 'React must receive the layout class through an export or an optimized inline className');
assert(bundle.includes('.' + mapping[1] + '{'), 'Export must reference a real CSS rule');
const rule = bundle.slice(bundle.indexOf('.' + mapping[1] + '{')).split('}')[0];
assert(rule.includes('display:grid'), 'Desktop layout must use grid');
assert(rule.includes('grid-template-columns:255px minmax(0,1fr)'), 'Desktop must have sidebar and content columns');
assert(bundle.includes('grid-template-columns:210px minmax(0,1fr)'), 'Tablet layout must retain two columns');
console.log('Optimized Settings layout passed: exported class survives production optimization and defines two desktop columns.');
