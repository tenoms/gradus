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

test('browser preferences keep distinct subject palettes and a shared mode while administration ignores them', () => {
  const managed = { mode: 'dark', math: { palette: 'violet' }, computer: { palette: 'teal' } };
  assert.deepEqual(preferences.effectiveTheme(managed, 'math'), { palette: 'violet', mode: 'dark' });
  assert.deepEqual(preferences.effectiveTheme(managed, 'computer'), { palette: 'teal', mode: 'dark' });
  const personal = { mode: 'light', math: { palette: 'amber' }, computer: { palette: 'blue' } };
  assert.deepEqual(preferences.effectiveTheme(managed, 'math', personal), { palette: 'amber', mode: 'light' });
  assert.deepEqual(preferences.effectiveTheme(managed, 'computer', personal), { palette: 'blue', mode: 'light' });
  assert.deepEqual(preferences.effectiveTheme(managed, 'admin', personal), { palette: 'violet', mode: 'dark' });
});

test('new preferences validate both subject objects strictly and return independent values', () => {
  const valid = { mode: 'system', math: { palette: 'rose' }, computer: { palette: 'managed' } };
  const normalized = preferences.validateThemePreference(valid);
  assert.deepEqual(normalized, valid);
  normalized.math.palette = 'blue';
  assert.equal(valid.math.palette, 'rose');
  for (const input of [
    {}, [], { palette: 'rose', mode: 'dark' },
    { ...valid, extra: true }, { ...valid, mode: 'auto' },
    { ...valid, math: null }, { ...valid, computer: [] },
    { ...valid, math: { palette: 'bad' } },
    { ...valid, computer: { palette: 'teal', mode: 'dark' } },
  ]) assert.throws(() => preferences.validateThemePreference(input), /主题偏好格式不正确/);
  const first = preferences.themePreferenceDefaults(), second = preferences.themePreferenceDefaults();
  first.math.palette = 'amber';
  assert.equal(first.computer.palette, 'managed');
  assert.equal(second.math.palette, 'managed');
});

test('reading the old shared palette drops it for both subjects but retains its valid global mode', () => {
  for (const mode of ['managed', 'system', 'light', 'dark']) {
    assert.deepEqual(preferences.parseThemePreference(JSON.stringify({ palette: 'rose', mode })), {
      mode, math: { palette: 'managed' }, computer: { palette: 'managed' },
    });
  }
  for (const input of [undefined, '', 'bad json', '{}', '{"palette":"violet","mode":"auto"}', '{"palette":"<script>","mode":"dark"}', '{"palette":"rose","mode":"dark","extra":true}']) {
    assert.deepEqual(preferences.parseThemePreference(input), preferences.themePreferenceDefaults());
  }
});

test('storage is removed only when both colors and the shared mode use managed settings', () => {
  const entries = new Map();
  const storage = { setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key), getItem: key => entries.get(key) || null };
  const preference = { ...preferences.themePreferenceDefaults(), computer: { palette: 'blue' } };
  assert.equal(preferences.writeThemePreference(preference, storage), true);
  assert.deepEqual(preferences.readThemePreference(storage), preference);
  assert.equal(preferences.writeThemePreference({ ...preferences.themePreferenceDefaults(), mode: 'dark' }, storage), true);
  assert.equal(entries.has(preferences.themePreferenceKey), true);
  assert.equal(preferences.writeThemePreference(preferences.themePreferenceDefaults(), storage), true);
  assert.equal(entries.has(preferences.themePreferenceKey), false);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.deepEqual(preferences.readThemePreference(blocked), preferences.themePreferenceDefaults());
  assert.equal(preferences.writeThemePreference(preference, blocked), false);
  assert.equal(preferences.writeThemePreference(preferences.themePreferenceDefaults(), blocked), false);
});

test('changing a subject color preserves the other subject, shared mode and its own managed reset', async () => {
  const fixture = controller(); await fixture.flush();
  assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'light');
  fixture.current.setPreference({ math: { palette: 'blue' }, mode: 'dark' }); fixture.render();
  assert.equal(fixture.current.palette, 'blue'); assert.equal(fixture.current.scheme, 'dark');
  fixture.space = 'computer'; fixture.render();
  assert.equal(fixture.current.palette, 'teal'); assert.equal(fixture.current.scheme, 'dark');
  fixture.current.setPreference({ computer: { palette: 'amber' } }); fixture.render();
  fixture.space = 'math'; fixture.render();
  assert.equal(fixture.current.palette, 'blue'); assert.equal(fixture.current.scheme, 'dark');
  assert.deepEqual(JSON.parse(fixture.entries.get(preferences.themePreferenceKey)), { mode: 'dark', math: { palette: 'blue' }, computer: { palette: 'amber' } });
  fixture.current.setPreference({ math: { palette: 'managed' } }); fixture.render();
  assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'dark');
  fixture.space = 'computer'; fixture.render(); assert.equal(fixture.current.palette, 'amber');
  fixture.current.resetPreference(); fixture.render();
  assert.equal(fixture.current.palette, 'teal'); assert.equal(fixture.current.scheme, 'light');
  assert.equal(fixture.entries.has(preferences.themePreferenceKey), false);
  assert.ok(fixture.calls.every(call => call.path === '/api/appearance' && !call.options), 'personal preferences never use a write API');
  fixture.unmount();
});

test('browser reload retains distinct personal colors and legacy reads restore managed subject colors', async () => {
  const fixture = controller(); await fixture.flush();
  fixture.current.setPreference({ math: { palette: 'blue' }, computer: { palette: 'rose' }, mode: 'dark' }); fixture.render();
  const reopened = controller({ preference: JSON.parse(fixture.entries.get(preferences.themePreferenceKey)) }); await reopened.flush();
  assert.equal(reopened.current.palette, 'blue'); assert.equal(reopened.current.scheme, 'dark');
  reopened.space = 'computer'; reopened.render(); assert.equal(reopened.current.palette, 'rose');
  const legacy = controller({ preference: { palette: 'amber', mode: 'dark' } }); await legacy.flush();
  assert.equal(legacy.current.palette, 'violet'); assert.equal(legacy.current.scheme, 'dark');
  legacy.space = 'computer'; legacy.render(); assert.equal(legacy.current.palette, 'teal');
  fixture.unmount(); reopened.unmount(); legacy.unmount();
});

test('system and managed updates affect the shared mode and only subjects without a personal palette', async () => {
  const fixture = controller(); await fixture.flush();
  fixture.media.matches = true; fixture.media.dispatchEvent({ type: 'change' }); fixture.render(); assert.equal(fixture.current.scheme, 'dark');
  fixture.current.setPreference({ mode: 'light', math: { palette: 'rose' } }); fixture.render();
  fixture.window.dispatchEvent({ type: 'study-appearance-updated', detail: { config: { mode: 'dark', math: { palette: 'amber' }, computer: { palette: 'blue' } }, revision: 2, updatedAt: null } }); fixture.render();
  assert.equal(fixture.current.scheme, 'light'); assert.equal(fixture.current.palette, 'rose');
  fixture.space = 'computer'; fixture.render();
  assert.equal(fixture.current.scheme, 'light'); assert.equal(fixture.current.palette, 'blue');
  fixture.current.resetPreference(); fixture.render(); assert.equal(fixture.current.scheme, 'dark'); assert.equal(fixture.current.palette, 'blue');
  fixture.space = 'math'; fixture.render(); assert.equal(fixture.current.palette, 'amber');
  fixture.unmount();
});

test('storage events synchronize independent colors and clearing storage restores both managed colors', async () => {
  const fixture = controller(); await fixture.flush();
  fixture.window.dispatchEvent({ type: 'storage', key: preferences.themePreferenceKey, newValue: '{"mode":"dark","math":{"palette":"managed"},"computer":{"palette":"amber"}}' }); fixture.render();
  assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'dark');
  fixture.space = 'computer'; fixture.render(); assert.equal(fixture.current.palette, 'amber');
  fixture.window.dispatchEvent({ type: 'storage', key: preferences.themePreferenceKey, newValue: null }); fixture.render();
  assert.equal(fixture.current.palette, 'teal'); assert.equal(fixture.current.scheme, 'light');
  fixture.window.dispatchEvent({ type: 'storage', key: preferences.themePreferenceKey, newValue: '{"mode":"dark","math":{"palette":"blue"},"computer":{"palette":"rose"}}' }); fixture.render();
  fixture.window.dispatchEvent({ type: 'storage', key: null }); fixture.render();
  assert.equal(fixture.current.palette, 'teal'); assert.equal(fixture.current.scheme, 'light');
  fixture.unmount();
  assert.equal([...fixture.window.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  assert.equal([...fixture.media.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
});

test('local preference events update both subject slots while rejecting incomplete values', async () => {
  const fixture = controller(); await fixture.flush();
  const preference = { mode: 'dark', math: { palette: 'amber' }, computer: { palette: 'blue' } };
  fixture.window.dispatchEvent({ type: preferences.themePreferenceEvent, detail: { preferences: preference, persisted: true } }); fixture.render();
  assert.equal(fixture.current.palette, 'amber'); assert.equal(fixture.current.scheme, 'dark');
  fixture.space = 'computer'; fixture.render(); assert.equal(fixture.current.palette, 'blue');
  fixture.window.dispatchEvent({ type: preferences.themePreferenceEvent, detail: { preferences: { palette: 'rose', mode: 'light' }, persisted: true } }); fixture.render();
  assert.equal(fixture.current.palette, 'blue'); assert.equal(fixture.current.scheme, 'dark');
  fixture.unmount();
});

test('blocked persistence retains independent page choices while administration ignores both palette slots', async () => {
  const fixture = controller({ blocked: true }); await fixture.flush();
  fixture.current.setPreference({ math: { palette: 'amber' }, mode: 'dark' }); fixture.render();
  assert.equal(fixture.current.palette, 'amber'); assert.equal(fixture.current.scheme, 'dark'); assert.equal(fixture.current.preferencePersisted, false);
  fixture.space = 'computer'; fixture.render(); assert.equal(fixture.current.palette, 'teal');
  fixture.current.setPreference({ computer: { palette: 'blue' } }); fixture.render(); assert.equal(fixture.current.palette, 'blue');
  fixture.space = 'math'; fixture.render(); assert.equal(fixture.current.palette, 'amber');
  fixture.space = 'admin'; fixture.render(); assert.equal(fixture.current.palette, 'violet'); assert.equal(fixture.current.scheme, 'light');
  fixture.unmount();
});
