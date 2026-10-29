import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { appearanceDefaults, normalizeAppearanceConfig, validateAppearanceConfig } from '../../../shared/appearance.mjs';
import { resolvedScheme, themeVariables } from '../../../src/shared/theme/theme-tokens.mjs';
import * as preferences from '../../../src/shared/theme/preferences.mjs';

const source = await readFile(new URL('../../../src/shared/theme/use-space-theme.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('use-space-theme.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const executable = ts.transpileModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast).replace(/^export\s+/, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const eventBus = () => {
  const listeners = new Map();
  return { listeners, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); }, removeEventListener(type, fn) { listeners.get(type)?.delete(fn); }, dispatchEvent(event) { listeners.get(event.type)?.forEach(fn => fn(event)); } };
};
function controller({ space = 'math', cache, preference, blocked = false } = {}) {
  const entries = new Map();
  if (cache) entries.set('study-appearance', JSON.stringify(cache));
  if (preference) entries.set(preferences.themePreferenceKey, JSON.stringify(preference));
  const storage = { getItem: key => entries.get(key) || null, setItem(key, value) { if (blocked) throw new Error('storage unavailable'); entries.set(key, value); }, removeItem(key) { if (blocked) throw new Error('storage unavailable'); entries.delete(key); } };
  const media = { ...eventBus(), matches: false };
  const window = eventBus(), document = { ...eventBus(), visibilityState: 'visible', documentElement: { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } } };
  const values = [], dependencies = [], cleanup = [];
  let cursor = 0, effectCursor = 0, dirty = false, effects = [];
  const fixture = { space, entries, window, media, document, calls: [], configuration: appearanceDefaults() };
  function effect(kind, fn, deps) {
    const index = effectCursor++;
    if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) effects.push({ kind, run() { cleanup[index]?.(); cleanup[index] = fn(); } });
    dependencies[index] = deps;
  }
  const create = runInNewContext(`${executable}\nuseSpaceTheme;`, {
    ...preferences, appearanceDefaults, normalizeAppearanceConfig, validateAppearanceConfig, resolvedScheme, themeVariables,
    localStorage: storage, window, document, matchMedia: () => media,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    readThemePreference: () => preferences.readThemePreference(storage), writeThemePreference: value => preferences.writeThemePreference(value, storage),
    api: async (path, options) => { fixture.calls.push({ path, options }); return { config: fixture.configuration, revision: 1, updatedAt: null }; },
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; dirty = true; }]; },
    useEffect: (fn, deps) => effect('passive', fn, deps), useLayoutEffect: (fn, deps) => effect('layout', fn, deps),
  });
  fixture.render = () => {
    do { dirty = false; cursor = 0; effectCursor = 0; effects = []; fixture.current = create(fixture.space); effects.filter(value => value.kind === 'layout').forEach(value => value.run()); effects.filter(value => value.kind === 'passive').forEach(value => value.run()); } while (dirty);
    return fixture.current;
  };
  fixture.flush = async () => { await new Promise(done => setImmediate(done)); fixture.render(); };
  fixture.unmount = () => cleanup.forEach(fn => fn?.());
  fixture.render();
  return fixture;
}

test('browser preferences default to managed colors and mode, with explicit personal values taking priority', () => {
  const managed = { mode: 'dark', math: { palette: 'violet' }, computer: { palette: 'teal' } };
  assert.deepEqual(preferences.effectiveTheme(managed, 'math'), { palette: 'violet', mode: 'dark' });
  assert.deepEqual(preferences.effectiveTheme(managed, 'computer'), { palette: 'teal', mode: 'dark' });
  const personal = { palette: 'amber', mode: 'light' };
  assert.deepEqual(preferences.effectiveTheme(managed, 'math', personal), personal);
  assert.deepEqual(preferences.effectiveTheme(managed, 'computer', personal), personal);
  assert.deepEqual(preferences.effectiveTheme(managed, 'admin', personal), { palette: 'violet', mode: 'dark' });
});

test('malformed local values fall back to managed settings and blocked browser storage does not throw', () => {
  for (const input of [undefined, '', 'bad json', '{}', '{"palette":"violet","mode":"auto"}', '{"palette":"<script>","mode":"dark"}']) assert.deepEqual(preferences.parseThemePreference(input), preferences.themePreferenceDefaults());
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(preferences.readThemePreference(blocked), preferences.themePreferenceDefaults());
  assert.equal(preferences.writeThemePreference({ palette: 'rose', mode: 'dark' }, blocked), false);
  assert.equal(preferences.writeThemePreference(preferences.themePreferenceDefaults(), blocked), false);
});

test('learner updates apply immediately across subjects and reset removes the local override without write APIs', async () => {
  const fixture = controller(); await fixture.flush();
  assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'light');
  fixture.current.setPreference({ palette: 'blue', mode: 'dark' }); fixture.render();
  assert.equal(fixture.current.palette, 'blue'); assert.equal(fixture.current.scheme, 'dark');
  assert.deepEqual(JSON.parse(fixture.entries.get(preferences.themePreferenceKey)), { palette: 'blue', mode: 'dark' });
  fixture.space = 'computer'; fixture.render(); assert.equal(fixture.current.palette, 'blue');
  fixture.current.resetPreference(); fixture.render();
  assert.equal(fixture.current.palette, 'teal'); assert.equal(fixture.current.scheme, 'light');
  assert.equal(fixture.entries.has(preferences.themePreferenceKey), false);
  assert.ok(fixture.calls.every(call => call.path === '/api/appearance' && !call.options), 'personal preferences never use a write API');
  fixture.unmount();
});

test('system changes resolve instantly while fixed personal choices are preserved after managed updates', async () => {
  const fixture = controller(); await fixture.flush();
  fixture.media.matches = true; fixture.media.dispatchEvent({ type: 'change' }); fixture.render(); assert.equal(fixture.current.scheme, 'dark');
  fixture.current.setPreference({ mode: 'light', palette: 'rose' }); fixture.render();
  fixture.window.dispatchEvent({ type: 'study-appearance-updated', detail: { config: { mode: 'dark', math: { palette: 'amber' }, computer: { palette: 'blue' } }, revision: 2, updatedAt: null } }); fixture.render();
  assert.equal(fixture.current.scheme, 'light'); assert.equal(fixture.current.palette, 'rose');
  fixture.current.resetPreference(); fixture.render(); assert.equal(fixture.current.scheme, 'dark'); assert.equal(fixture.current.palette, 'amber');
  fixture.unmount();
});

test('storage events synchronize personal choices and clearing local storage returns to management inheritance', async () => {
  const fixture = controller(); await fixture.flush();
  fixture.window.dispatchEvent({ type: 'storage', key: preferences.themePreferenceKey, newValue: '{"palette":"teal","mode":"dark"}' }); fixture.render();
  assert.equal(fixture.current.palette, 'teal'); assert.equal(fixture.current.scheme, 'dark');
  fixture.window.dispatchEvent({ type: 'storage', key: preferences.themePreferenceKey, newValue: null }); fixture.render();
  assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'light');
  fixture.unmount();
  assert.equal([...fixture.window.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  assert.equal([...fixture.media.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
});

test('local preference changes still work for this page when persistence fails, and administration ignores them', async () => {
  const fixture = controller({ blocked: true }); await fixture.flush();
  fixture.current.setPreference({ palette: 'amber', mode: 'dark' }); fixture.render();
  assert.equal(fixture.current.palette, 'amber'); assert.equal(fixture.current.scheme, 'dark'); assert.equal(fixture.current.preferencePersisted, false);
  fixture.space = 'admin'; fixture.render(); assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'light');
  fixture.unmount();
});
