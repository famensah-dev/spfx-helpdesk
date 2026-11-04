const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.org', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
const React = require('react'), ReactDOM = require('react-dom'), { act } = require('react-dom/test-utils');
const h = React.createElement;
const Button = ({ text, onClick, disabled }) => h('button', { onClick, disabled }, text);
const fluent = { DefaultButton: Button, PrimaryButton: Button, Icon: () => null, PanelType: { custom: 1 }, Panel: ({ isOpen, children }) => isOpen ? h('section', null, children) : null, Spinner: ({ label }) => h('p', null, label), MessageBar: ({ children }) => h('p', { role: 'alert' }, children), MessageBarType: { error: 1 }, TextField: () => null };
const moduleUnderTest = { exports: {} };
const source = fs.readFileSync('src/webparts/helpdeskSystem/components/SelfServiceGuide.tsx', 'utf8');
new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText)(name => name === '@fluentui/react' ? fluent : name.endsWith('.scss') ? { default: {} } : name === './RichTextEditor' ? { RichTextContent: ({ value }) => h('div', null, value) } : require(name), moduleUnderTest, moduleUnderTest.exports);
const Guide = moduleUnderTest.exports.SelfServiceGuide;
const host = document.getElementById('app');
let draft;
const service = { getFaqs: async manage => { assert.equal(manage, false); return [
  { id: 1, question: 'Cannot sign in', answer: 'Reset your password', category: 'Email', subcategory: 'Access', published: true, sortOrder: 1 },
  { id: 2, question: 'SECRET DRAFT', category: 'Secret', published: false, sortOrder: 0 }
]; }, getCreationOptions: async () => ({ classification: { categories: [{ id: '10', name: 'Email' }], subcategories: [{ id: '11', parentId: '10', name: 'Access' }] }, fields: [] }) };
async function click(text) { const button = [...host.querySelectorAll('button')].find(item => item.textContent === text); assert(button, 'Missing button: ' + text); await act(async () => { button.click(); }); }
async function render(canCreate = true) { await act(async () => { ReactDOM.render(h(Guide, { service, canCreate, onCreate: value => { draft = value; } }), host); }); }
(async () => {
  await render(); await click('Need Help?');
  assert(!host.textContent.includes('SECRET DRAFT')); assert(!host.textContent.includes('Secret'));
  await click('Email'); await click('Access'); await click('Cannot sign in');
  assert(host.textContent.includes('Reset your password'));
  await click('Yes, It Helped'); assert(host.textContent.includes('Glad That Helped!'));
  await click('Back'); await click('No, I Still Need Help'); await click('Continue to Ticket Form');
  assert.equal(draft.category, '10'); assert.equal(draft.subcategory, '11'); assert.equal(draft.title, 'Cannot sign in');
  assert.match(draft.description, /Email > Access > Cannot sign in/); assert.match(draft.description, /Guides reviewed/);
  assert(!host.textContent.includes('Continue to Ticket Form'));
  await render(false); await click('Need Help?'); assert(!host.textContent.includes('Create a Ticket'));
  await act(async () => ReactDOM.unmountComponentAtNode(host));
  console.log('Self-service guide: published visibility, navigation, solved state, escalation and classification handoff passed.');
  dom.window.close(); process.exit(0);
})().catch(error => { console.error(error); dom.window.close(); process.exit(1); });
