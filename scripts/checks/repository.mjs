import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const failures = [];
function filesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : entry.isFile() ? [file] : [];
  });
}
const sourceFiles = ['src', 'server', 'shared'].flatMap(directory => filesIn(path.join(root, directory)));
const codeFiles = sourceFiles.filter(file => /\.(?:[cm]?js|tsx?|mts)$/.test(file));
const extensions = ['', '.ts', '.tsx', '.mjs', '.js', '.mts', '.json', '.css', '/index.ts', '/index.tsx', '/index.mjs'];
function resolveImport(importer, specifier) {
  const target = path.resolve(path.dirname(importer), specifier);
  return extensions.map(extension => target + extension).find(candidate => existsSync(candidate) && statSync(candidate).isFile());
}
function specifiers(source, filename) {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const found = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) found.push(node.arguments[0].text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) found.push(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}
function checkDependency(from, to) {
  if (/^(?:src|shared)\//.test(from) && to.startsWith('config/') && (to !== 'config/system.json' || !['src/shared/config/public.mjs', 'src/shared/config/public.d.mts'].includes(from))) return '浏览器配置只能通过 shared/config/public 访问系统配置的公开部分';
  if (from.startsWith('src/shared/') && /^src\/(?:app|features)\//.test(to)) return '前端共享模块不能反向依赖业务或应用入口';
  if (from.startsWith('src/features/') && to.startsWith('src/app/')) return '业务模块不能反向依赖应用装配';
  if (from.startsWith('src/') && /^(?:server|tests|scripts)\//.test(to)) return '浏览器源码不能依赖服务端或验证工具';
  if (from.startsWith('server/') && /^(?:src|tests|scripts)\//.test(to)) return '服务端源码不能依赖浏览器或验证工具';
  if (from.startsWith('server/infrastructure/') && /^server\/(?:modules|integrations)\//.test(to)) return '基础设施不能反向依赖业务或外部平台适配';
  if (from.startsWith('shared/') && /^(?:src|server|tests|scripts)\//.test(to)) return '跨端领域规则不能依赖任一端的实现';
}
let dependencies = 0;
for (const file of sourceFiles) {
  const name = relative(file);
  if (name.startsWith('src/') && !/^src\/(?:app|features|shared)\//.test(name)) failures.push(`${name}: 源码需归属 app、features 或 shared`);
  if (name.startsWith('server/') && !/^server\/(?:(?:app|index)\.mjs$|(?:modules|integrations|infrastructure)\/)/.test(name)) failures.push(`${name}: 服务端实现需归属明确职责目录`);
}
for (const file of codeFiles) {
  const from = relative(file);
  const source = readFileSync(file, 'utf8');
  if (/(?:yyb\.txt|wx[a-z\d]{16}-(?:math|computer))/i.test(source)) failures.push(`${from}: 运行时代码不能依赖开发资产`);
  for (const specifier of specifiers(source, file)) {
    if (!specifier.startsWith('.')) continue;
    const target = resolveImport(file, specifier);
    if (!target) { failures.push(`${from}: 无法解析 ${specifier}`); continue; }
    dependencies++;
    const to = relative(target), reason = checkDependency(from, to);
    if (reason) failures.push(`${from} → ${to}: ${reason}`);
  }
}
for (const [file, entry] of [['learn.html', 'src/app/learning/main.tsx'], ['admin.html', 'src/app/admin/main.tsx']]) {
  if (!existsSync(path.join(root, entry)) || !readFileSync(path.join(root, file), 'utf8').includes(`src="/${entry}"`)) failures.push(`${file}: 入口应指向 ${entry}`);
}
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
for (const file of tracked) {
  if (!existsSync(path.join(root, file))) continue;
  if (/^config\/.*\.json$/.test(file) && file !== 'config/system.json') failures.push(`${file}: 系统配置统一保存于 config/system.json`);
  if (file.startsWith('docs/')) failures.push(`${file}: docs/ 为本机文档目录，不纳入版本库`);
  if (/^(?:node_modules|dist|artifacts|\.data)\//.test(file) || /(?:^|\/)\.DS_Store$|\.(?:sqlite(?:3)?|log|tsbuildinfo)$/.test(file) || /(?:^|\/)\.env(?:$|\.(?!example$))/.test(file)) failures.push(`${file}: 生成物、本机状态及凭据不应进入版本库`);
}
const markdown = [path.join(root, 'README.md'), path.join(root, 'CONTRIBUTING.md')].filter(existsSync);
for (const file of markdown) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^[a-z][a-z\d+.-]*:/i.test(link) || !/\.md$/i.test(link)) continue;
    if (!existsSync(path.resolve(path.dirname(file), decodeURIComponent(link)))) failures.push(`${relative(file)}: 文档链接不存在 ${link}`);
  }
}
console.log(`Repository structure: ${sourceFiles.length} source files, ${dependencies} local dependencies, ${markdown.length} documents`);
if (failures.length) {
  failures.forEach(failure => console.error(`  ${failure}`));
  process.exitCode = 1;
} else console.log('Repository structure and dependency checks passed.');
