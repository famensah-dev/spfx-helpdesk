const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator; global.Element = dom.window.Element; global.DOMParser = dom.window.DOMParser;
const React = require('react'), ReactDOM = require('react-dom');
const { act, Simulate } = require('react-dom/test-utils');
const h = React.createElement;
function load(path, deps = {}) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React }
  }).outputText)(name => deps[name] || require(name), module, module.exports);
  return module.exports;
}
const menus = {};
const button = props => {
  if (props.menuProps) menus[props.ariaLabel] = props.menuProps.items;
  return h('button', { type: props.type || 'button', disabled: props.disabled, 'aria-label': props.ariaLabel, onClick: props.onClick }, props.text || props.ariaLabel);
};
const fluent = { DirectionalHint:{bottomLeftEdge:4}, Icon:()=>null, Callout:p=>h('div',{'data-callout':true},p.children), IconButton: button, DefaultButton: button, PrimaryButton: button, Label: p => h('label', null, p.children), Dropdown: () => null, SearchBox: () => null };
const styles = { default: new Proxy({}, { get: (_, key) => String(key) }) };
const base = 'src/webparts/helpdeskSystem/';
const rich = load(base + 'components/RichTextEditor.tsx', {
  react: React, '@fluentui/react': fluent, './HelpdeskSystem.module.scss': styles,
  '../utils/decodeHtmlEntities': load(base + 'utils/decodeHtmlEntities.ts')
});
const { RichTextEditor, safeDescriptionHtml, editorTableHtml, insertEditorTableRow, insertEditorTableColumn } = rich;
const { CommentComposer } = load(base + 'components/CommentComposer.tsx', {
  react: React, '@fluentui/react': fluent, './HelpdeskSystem.module.scss': styles,
  './RichTextEditor': rich, './AttachmentFiles': { AttachmentPicker: () => null }
});
const host = document.getElementById('app');
let saved;
const select = (element, end = false) => {
  const range = document.createRange(); range.selectNodeContents(element); range.collapse(!end);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
};
document.execCommand = (command, _, value) => {
  assert.equal(command, 'insertHTML');
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents(); const fragment = range.createContextualFragment(value); const last = fragment.lastChild;
  range.insertNode(fragment); range.setStartAfter(last); range.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  return true;
};
(async () => {
  const html = editorTableHtml(2, 3);
  const doc = new DOMParser().parseFromString(safeDescriptionHtml(html), 'text/html');
  assert.equal(doc.querySelectorAll('th[scope="col"]').length, 3);
  assert.equal(doc.querySelector('th').textContent,'','New headers start blank');
  assert.equal(doc.querySelectorAll('tbody td').length, 6);
  assert.throws(() => editorTableHtml(0, 3)); assert.throws(() => editorTableHtml(2, 100));
  const safe = safeDescriptionHtml('<table onclick="bad()"><tr><th scope="col" colspan="2">Title</th><td rowspan="999" onmouseover="bad()"><b>Bold</b><script>bad()</script><a href="javascript:bad()">link</a></td></tr></table>');
  assert(safe.includes('<table>')); assert(safe.includes('colspan="2"')); assert(safe.includes('<b>Bold</b>'));
  assert(!/onclick|onmouseover|script|javascript|rowspan/.test(safe));
  await act(async () => ReactDOM.render(h(RichTextEditor, { value: html, onChange: value => { saved = value; } }), host));
  let editor = host.querySelector('[role="textbox"]');
  assert.equal(editor.querySelectorAll('th').length, 3, 'Table-only saved content reopens as HTML');
  select(editor, true); Simulate.keyUp(editor);
  await act(async()=>host.querySelector('[aria-label="Insert table"]').click());
  let grid=host.querySelector('[role="grid"]');assert.equal(grid.querySelectorAll('[role="gridcell"]').length,100,'Picker is a 10 by 10 grid');
  const pick=grid.querySelector('[aria-label="2 columns, 2 rows"]');await act(async()=>Simulate.mouseEnter(pick));
  assert.equal(grid.querySelectorAll('[aria-selected="true"]').length,4,'Hover highlights the selected rectangle');
  await act(async()=>pick.click());assert(!host.querySelector('[role="grid"]'),'Selecting a size closes the picker');
  assert.equal(editor.querySelectorAll('table').length, 2, 'Toolbar inserts a table at the caret');
  assert(saved.includes('<table>'));
  const lastTable = editor.querySelectorAll('table')[1];
  const firstCell = lastTable.querySelector('td'); select(firstCell);
  await act(async () => Simulate.keyDown(editor, { key: 'Tab' }));
  assert.equal(window.getSelection().anchorNode, firstCell.nextElementSibling);
  const cells = lastTable.querySelectorAll('td'); select(cells[cells.length - 1]);
  const rows = lastTable.rows.length;
  await act(async () => Simulate.keyDown(editor, { key: 'Tab' }));
  assert.equal(lastTable.rows.length, rows + 1, 'Tab at the final cell appends a data row');
  select(editor, true); Simulate.keyUp(editor);
  await act(async () => Simulate.paste(editor, { clipboardData: { getData: kind => kind === 'text/html' ? safe : 'plain' } }));
  assert(saved.includes('colspan="2"'), 'Pasted table structure is preserved');
  await act(async () => ReactDOM.unmountComponentAtNode(host));
  await act(async () => ReactDOM.render(h(RichTextEditor, { value: 'Subject', plainText: true, onChange: () => {} }), host));
  assert(!host.querySelector('[aria-label="Insert table"]'), 'Plain-text subjects have no table controls');
  await act(async () => ReactDOM.unmountComponentAtNode(host));
  await act(async () => ReactDOM.render(h(CommentComposer, { value: 'A comment', files: [], disabled: false, posting: false, retry: false, canAttach: false, canPost: true, onFiles: () => {}, onChange: (_, value) => { saved = value; } }), host));
  editor = host.querySelector('[role="textbox"]'); editor.textContent = 'A comment'; select(editor, true); Simulate.keyUp(editor);
  await act(async()=>host.querySelector('[aria-label="Insert table"]').click());
  grid=host.querySelector('[role="grid"]');
  const one=grid.querySelector('[aria-label="1 columns, 1 rows"]');one.focus();
  await act(async()=>Simulate.keyDown(one,{key:'ArrowRight'}));assert.equal(document.activeElement.getAttribute('aria-label'),'2 columns, 1 rows');
  await act(async()=>grid.querySelector('[aria-label="3 columns, 3 rows"]').click());
  assert.equal(editor.querySelectorAll('th').length, 3, 'Comments support table insertion');
  assert(saved.includes('<table>'));
  const table=editor.querySelector('table');
  const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top,x:left,y:top,toJSON:()=>{}});
  editor.parentElement.getBoundingClientRect=()=>rect(0,0,300,200);
  table.getBoundingClientRect=()=>rect(10,20,210,100);
  const row=table.rows[1],cell=row.cells[0];row.getBoundingClientRect=()=>rect(10,40,210,60);cell.getBoundingClientRect=()=>rect(10,40,76,60);
  await act(async()=>cell.dispatchEvent(new window.MouseEvent('mousemove',{bubbles:true,clientX:45,clientY:60})));
  const plus=host.querySelector('[aria-label="Insert row here"]');assert(plus,'Clicking a row border offers a plus control');
  assert.equal(parseFloat(plus.style.left)+10,10,'Row insertion circle is centered on the table edge');
  const rowCount=table.rows.length;await act(async()=>plus.click());assert.equal(table.rows.length,rowCount+1);assert(!saved.includes('data-table-border-action'),'Editor controls are never saved with content');
  await act(async()=>cell.dispatchEvent(new window.MouseEvent('click',{bubbles:true,clientX:45,clientY:50})));
  assert(!host.querySelector('[aria-label="Move table"]'));assert(host.querySelector('[aria-label="Resize table"]'));
  global.getComputedStyle=window.getComputedStyle.bind(window);
  Object.defineProperty(editor,'clientWidth',{configurable:true,value:300});
  await act(async()=>Simulate.pointerDown(host.querySelector('[aria-label="Resize table"]'),{clientX:210,clientY:100,preventDefault:()=>{}}));
  await act(async()=>window.dispatchEvent(new window.MouseEvent('pointermove',{clientX:160,clientY:100})));
  await act(async()=>window.dispatchEvent(new window.MouseEvent('pointerup',{clientX:160,clientY:100})));
  assert.equal(parseFloat(table.style.width),50);assert(saved.includes('width: 50%'),'Resized table width is saved');
  assert(!safeDescriptionHtml('<table style="width:999%;position:fixed"><tr><td>x</td></tr></table>').includes('style='),'Unsafe table sizing styles are removed');
  const openMenu=async()=>act(async()=>cell.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:45,clientY:50})));
  await openMenu();
  const rowOption=Array.from(host.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Delete Selected Row');
  await act(async()=>Simulate.mouseEnter(rowOption));
  assert.equal(host.querySelectorAll('[data-table-delete-preview]').length,1,'Hovering row deletion highlights the selected row');
  const columnOption=Array.from(host.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Delete Selected Column');
  await act(async()=>Simulate.mouseEnter(columnOption));
  assert.equal(host.querySelectorAll('[data-table-delete-preview]').length,table.rows.length,'Hovering column deletion highlights that column in every row');
  assert(!editor.querySelector('[data-table-delete-preview]'),'Deletion previews stay outside editable content');
  for(const label of ['Insert Row Above','Insert Row Below','Insert Column Right','Insert Column Left']){
    await openMenu();const rowsBefore=table.rows.length,columnsBefore=table.rows[0].cells.length;
    await act(async()=>Array.from(host.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent===label).click());
    assert.equal(table.rows.length,rowsBefore+(label.includes('Row')?1:0));
    assert.equal(table.rows[0].cells.length,columnsBefore+(label.includes('Column')?1:0));
  }
  await openMenu();
  const oldColumns=table.rows[0].cells.length;
  await act(async()=>Array.from(host.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Delete Selected Column').click());
  assert.equal(table.rows[0].cells.length,oldColumns-1);
  const remainingCell=table.rows[1].cells[0];
  await act(async()=>remainingCell.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:45,clientY:50})));
  const oldRows=table.rows.length;
  await act(async()=>Array.from(host.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent==='Delete Selected Row').click());
  assert.equal(table.rows.length,oldRows-1);
  await act(async()=>table.rows[0].cells[0].dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:45,clientY:50})));
  const menuItems=Array.from(host.querySelectorAll('[role="menuitem"]'));assert.deepEqual(menuItems.map(item=>item.textContent),['Insert Row Above','Insert Row Below','Insert Column Right','Insert Column Left','Delete Selected Row','Delete Selected Column','Delete Table']);const deleteTable=menuItems[6];
  await act(async()=>deleteTable.click());assert(!editor.contains(table));assert(!saved.includes('<table'),'Deleting a table updates saved content');
  assert(!host.querySelector('[data-table-delete-preview]'),'Closing the menu removes its preview');
  const standalone=new DOMParser().parseFromString(editorTableHtml(2,10),'text/html').querySelector('table');
  assert(insertEditorTableColumn(standalone,1));assert(insertEditorTableColumn(standalone,2));
  assert.equal(standalone.rows[0].cells.length,12);assert.equal(standalone.rows[1].cells.length,12);assert.equal(insertEditorTableColumn(standalone,0),undefined,'Column insertion stops at 12');
  const count=standalone.rows.length;assert(insertEditorTableRow(standalone,2));assert.equal(standalone.rows.length,count+1);assert.equal(standalone.rows[2].cells.length,12);
  const single=new DOMParser().parseFromString(editorTableHtml(1,1,true),'text/html');assert.equal(single.querySelectorAll('tr').length,1,'A 1 by 1 selection includes only a header row');
  await act(async () => ReactDOM.unmountComponentAtNode(host)); dom.window.close();
  console.log('Rich-text tables passed: insertion, saved HTML, headers, sanitization, paste, cell navigation and comments.');process.exit(0);
})().catch(error => { console.error(error); dom.window.close(); process.exit(1); });
