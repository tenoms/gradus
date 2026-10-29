import { build } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceFile = path.join(root, "artifacts/space-bundle-graph.json");
const chunks = new Map();
const relativeModule = (id) => {
  const clean = id.replace(/^\0/, "").split("?")[0];
  const relative = path.relative(root, clean).replaceAll(path.sep, "/");
  return /^(?:src|shared)\//.test(relative) ? relative : null;
};
const forbidden = {
  admin: [
    /^src\/(?:App\.tsx|main\.tsx)$/,
    /^src\/lib\/(?:store\.ts|study-sync\.)/,
    /^src\/platforms\//,
    /^src\/pages\/(?:MathWorkspace|ComputerWorkspace)\./,
    /^src\/components\/(?:math|computer|learning)\//,
    /^src\/components\/identity\/(?:ConnectionDialog|Announcements|StudySyncIndicator|LegacyStudyImport)\./,
  ],
  learning: [
    /^src\/admin-main\.tsx$/,
    /^src\/apps\/AdminApp\./,
    /^src\/pages\/AdminWorkspace\./,
    /^src\/pages\/admin(?:\/|\.css$)/,
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
const passed = entries.admin.passed && entries.learning.passed;
await mkdir(path.dirname(evidenceFile), { recursive: true });
await writeFile(evidenceFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: "production",
  writesDist: false,
  includesStaticAndDynamicImports: true,
  passed,
  entries,
  chunks: Object.fromEntries([...chunks.entries()].sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + "\n");
for (const [name, result] of Object.entries(entries)) {
  console.log(`${name}: ${result.projectModuleCount} project modules, ${result.chunks.length} chunks, ${result.forbiddenDependencies.length} forbidden dependencies`);
  for (const module of result.forbiddenDependencies) console.error(`  ${name} imports ${module}`);
}
console.log(`Space dependency verification ${passed ? "passed" : "failed"}. Evidence: artifacts/space-bundle-graph.json`);
if (!passed) process.exitCode = 1;
