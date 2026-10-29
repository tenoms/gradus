import { build } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceFile = path.join(root, "artifacts/space-bundle-graph.json");
const chunks = new Map();
const relativeModule = (id) => {
  const clean = id.replace(/^\0/, "").split("?")[0];
  const relative = path.relative(root, clean).replaceAll(path.sep, "/");
  return /^(?:src|shared)\//.test(relative) ? relative : null;
};
const forbidden = {
  admin: [
    /^src\/app\/learning\//,
    /^src\/features\/(?:math|computer|learning)\//,
    /^src\/features\/identity\/(?:PersonalCenter|AccountConnection|PersonalImportedRecords|Announcements|StudySyncIndicator)\./,
  ],
  learning: [
    /^src\/app\/admin\//,
    /^src\/features\/admin\//,
  ],
};

await build({
  root,
  mode: "production",
  logLevel: "silent",
  build: { write: false },
  plugins: [{
    name: "verify-space-dependency-graph",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        chunks.set(output.fileName, {
          name: output.name,
          isEntry: output.isEntry,
          imports: output.imports,
          dynamicImports: output.dynamicImports,
          bytes: Buffer.byteLength(output.code),
          gzipBytes: gzipSync(output.code).byteLength,
          modules: Object.keys(output.modules).map(relativeModule).filter(Boolean).sort(),
        });
      }
    },
  }],
});

function inspectEntry(name) {
  const entry = [...chunks.entries()].find(([, chunk]) => chunk.isEntry && chunk.name === name);
  if (!entry) throw new Error(`当前生产构建未生成 ${name} 入口。`);
  const reached = new Set();
  function visit(file) {
    if (reached.has(file)) return;
    const chunk = chunks.get(file);
    if (!chunk) return;
    reached.add(file);
    for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) visit(dependency);
  }
  visit(entry[0]);
  const modules = [...new Set([...reached].flatMap(file => chunks.get(file).modules))].sort();
  const forbiddenDependencies = modules.filter(module => forbidden[name].some(pattern => pattern.test(module)));
  return { entryFile: entry[0], chunks: [...reached].sort(), projectModuleCount: modules.length, modules, forbiddenDependencies, passed: forbiddenDependencies.length === 0 };
}

const entries = { admin: inspectEntry("admin"), learning: inspectEntry("learning") };
function staticClosure(file, reached = new Set()) {
  if (reached.has(file) || !chunks.has(file)) return reached;
  reached.add(file);
  for (const dependency of chunks.get(file).imports) staticClosure(dependency, reached);
  return reached;
}
const learningInitial = staticClosure(entries.learning.entryFile);
function inspectDirectory(name) {
  const entry = [...chunks.entries()].find(([, chunk]) => chunk.modules.includes(`src/features/${name.toLowerCase()}/${name}Workspace.tsx`));
  if (!entry) throw new Error(`当前生产构建缺少 ${name} 目录入口。`);
  const reached = staticClosure(entry[0]);
  const modules = [...new Set([...reached].flatMap(file => chunks.get(file).modules))].sort();
  const forbiddenDependencies = modules.filter(module => /^src\/(?:shared\/content\/RichContent\.tsx|features\/math\/(?:questions\/MathQuestionReader|courses\/MathCourses|exams\/MathExams)\.tsx|features\/computer\/(?:practice\/ComputerExerciseSession|courses\/ComputerCourses|schools\/ComputerSchools)\.tsx)$/.test(module));
  const incremental = [...reached].filter(file => !learningInitial.has(file));
  return {
    entryFile: entry[0], chunks: [...reached].sort(), modules,
    incrementalScriptBytes: incremental.reduce((sum, file) => sum + chunks.get(file).bytes, 0),
    incrementalGzipBytes: incremental.reduce((sum, file) => sum + chunks.get(file).gzipBytes, 0),
    forbiddenDependencies, passed: forbiddenDependencies.length === 0,
  };
}
const directories = { math: inspectDirectory("Math"), computer: inspectDirectory("Computer") };
const passed = [...Object.values(entries), ...Object.values(directories)].every(result => result.passed);
await mkdir(path.dirname(evidenceFile), { recursive: true });
await writeFile(evidenceFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: "production",
  writesDist: false,
  includesStaticAndDynamicImports: true,
  passed,
  entries,
  directories,
  chunks: Object.fromEntries([...chunks.entries()].sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + "\n");
for (const [name, result] of Object.entries(entries)) {
  console.log(`${name}: ${result.projectModuleCount} project modules, ${result.chunks.length} chunks, ${result.forbiddenDependencies.length} forbidden dependencies`);
  for (const module of result.forbiddenDependencies) console.error(`  ${name} imports ${module}`);
}
for (const [name, result] of Object.entries(directories)) {
  console.log(`${name} directory: ${result.incrementalScriptBytes} additional JS bytes (${result.incrementalGzipBytes} gzip), ${result.forbiddenDependencies.length} eager readers or unrelated sections`);
  for (const module of result.forbiddenDependencies) console.error(`  ${name} eagerly imports ${module}`);
}
console.log(`Space dependency verification ${passed ? "passed" : "failed"}. Evidence: artifacts/space-bundle-graph.json`);
if (!passed) process.exitCode = 1;
