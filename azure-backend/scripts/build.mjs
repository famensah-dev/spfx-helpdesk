import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.join(root, 'src/webparts/helpdeskSystem');
const output = path.join(root, 'azure-backend/compiled');
const shim = path.join(root, 'azure-backend/src/sharepoint-runtime.cjs');
for (const folder of ['services','interfaces','utils']) {
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {walk(filename);continue;}
      if (!entry.name.endsWith('.ts')) continue;
      const target = path.join(output, path.relative(sourceRoot,filename)).replace(/\.ts$/,'.js');
      let source = fs.readFileSync(filename,'utf8');
      const relativeShim = path.relative(path.dirname(target),shim).replaceAll('\\','/');
      source = source.replace(/(['"])(?:@microsoft\/sp-http|@pnp\/sp(?:\/[^'"]*)?)\1/g, JSON.stringify(relativeShim.startsWith('.')?relativeShim:'./'+relativeShim));
      const result = ts.transpileModule(source,{fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
      const errors = result.diagnostics?.filter(item=>item.category===ts.DiagnosticCategory.Error);
      if (errors?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:value=>value,getNewLine:()=> '\n'}));
      fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,result.outputText);
    }
  };
  walk(path.join(sourceRoot,folder));
}
// Email rendering needs the shared sanitizer, not a React component or its CSS.
const editorPath = path.join(sourceRoot,'components/RichTextEditor.tsx');
const editor = ts.createSourceFile(editorPath,fs.readFileSync(editorPath,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const sanitizer = editor.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='safeDescriptionHtml');
if (!sanitizer) throw new Error('Shared email sanitizer was not found.');
fs.mkdirSync(path.join(output,'components'),{recursive:true});
fs.writeFileSync(path.join(output,'components/RichTextEditor.js'),ts.transpileModule(sanitizer.getText(editor),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
fs.writeFileSync(path.join(output,'package.json'),'{"type":"commonjs"}');
console.log('Current DeskPilot services compiled for Azure.');
