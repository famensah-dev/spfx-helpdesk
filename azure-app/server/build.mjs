import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, 'azure-app/server/compiled');
for (const directory of ['azure-app/src/services', 'src/webparts/helpdeskSystem/utils']) {
  for (const name of fs.readdirSync(path.join(root, directory)).filter(name => name.endsWith('.ts'))) {
    const target = path.join(output, directory, name.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(path.join(root, directory, name), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText);
  }
}
fs.writeFileSync(path.join(output, 'package.json'), '{"type":"commonjs"}');
console.log('Server data services compiled.');
