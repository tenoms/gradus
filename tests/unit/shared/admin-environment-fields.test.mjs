import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const fixture = {
  React,
  useEffect() {},
  states: [],
  cursor: 0,
  useState(initial) {
    const index = fixture.cursor++;
    return [index < fixture.states.length ? fixture.states[index] : typeof initial === 'function' ? initial() : initial, () => {}];
  },
  calls: [],
  response: undefined,
  async api(path, options) {
    fixture.calls.push({ path, ...options, body: options?.body ? JSON.parse(options.body) : undefined });
    return fixture.response;
  },
  ApiError: class ApiError extends Error {},
};
globalThis.__adminEnvironmentFixture = fixture;

async function component(file) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
  const ast = ts.createSourceFile('component.js', output, ts.ScriptTarget.Latest, true);
  let transformed = output;
  for (const node of ast.statements.filter(ts.isImportDeclaration).reverse()) {
    const module = node.moduleSpecifier.text;
    const names = node.importClause?.namedBindings?.elements?.map(element => element.name.text) || [];
    let replacement = '';
    if (module === 'react' || module.endsWith('/shared/api/client')) replacement = `const {${names.join(',')}}=globalThis.__adminEnvironmentFixture;`;
    else if (module === 'lucide-react') replacement = names.map(name => `const ${name}=()=>null;`).join('');
    else assert.ok(module.endsWith('.css'), `unexpected runtime dependency: ${module}`);
    transformed = transformed.slice(0, node.getStart(ast)) + replacement + transformed.slice(node.end);
  }
  return (await import(`data:text/javascript;base64,${Buffer.from('const React=globalThis.__adminEnvironmentFixture.React;' + transformed).toString('base64')}`)).default;
}
const IntegrationSettings = await component('../../../src/features/admin/integrations/IntegrationSettings.tsx');
const YybServices = await component('../../../src/features/admin/integrations/YybServices.tsx');
const secretPaths = ['math.ocrUsername', 'math.ocrPassword', 'computer.oauthClientSecret', 'computer.videoKey', 'computer.videoIv'];
const configuration = environmentFields => ({
  revision: 4,
  environmentFields,
  config: {
    yyb: { baseUrl: 'https://source.example.test' },
    math: { enabled: true, baseUrl: 'https://math.example.test', appId: 'wx1111111111111111', stationId: 1, loginId: 2, ocrUrl: 'https://ocr.example.test' },
    computer: { enabled: true, baseUrl: 'https://computer.example.test', appId: 'wx2222222222222222', tenantCode: '1', oauthClientId: 'client' },
  },
  secretStatus: Object.fromEntries(secretPaths.map(path => [path, true])),
});
function prepareIntegration(saved, { secrets = {}, clear = [], draft = saved.config } = {}) {
  fixture.states = [saved, structuredClone(draft), Object.fromEntries(secretPaths.map(path => [path, secrets[path] || ''])), clear, false, false, '', false, '', undefined, undefined, '', [], false, '', ''];
  fixture.cursor = 0;
  fixture.calls = [];
  fixture.response = saved;
}
function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

test('platform fields controlled by the environment are identified and disabled while other settings stay editable', () => {
  const saved = configuration(['math.enabled', 'math.baseUrl', 'computer.oauthClientSecret']);
  prepareIntegration(saved);
  const tree = IntegrationSettings();
  assert.equal(elements(tree, element => element.type === 'input' && element.props['aria-label'] === '启用考研数学')[0].props.disabled, true);
  assert.equal(elements(tree, element => element.type === 'input' && element.props.value === saved.config.math.baseUrl)[0].props.disabled, true);
  assert.equal(elements(tree, element => element.type === 'input' && element.props.value === saved.config.computer.baseUrl)[0].props.disabled, false);
  prepareIntegration(saved);
  const html = renderToStaticMarkup(React.createElement(IntegrationSettings));
  assert.match(html, /\.env 控制/);
  assert.match(html, /id="integration-computer\.oauthClientSecret"[^>]*disabled=""/);
  assert.match(html, /aria-label="清空OAuth 客户端密钥"[^>]*disabled=""/);
  assert.match(html, /\.env 控制的项目请在服务器修改并重启/);
});

test('platform saves never send environment-controlled secrets or clear requests even if stale edits exist', async () => {
  const saved = configuration(['math.baseUrl', 'computer.oauthClientSecret']);
  prepareIntegration(saved, { secrets: { 'computer.oauthClientSecret': 'stale-environment-edit', 'math.ocrUsername': 'new-username' }, clear: ['computer.oauthClientSecret', 'math.ocrPassword'] });
  const form = elements(IntegrationSettings(), element => element.type === 'form')[0];
  await form.props.onSubmit({ preventDefault() {} });
  const sent = fixture.calls[0].body;
  assert.equal(sent.config.math.baseUrl, saved.config.math.baseUrl);
  assert.equal(sent.config.math.ocrUsername, 'new-username');
  assert.equal(Object.hasOwn(sent.config.computer, 'oauthClientSecret'), false);
  assert.deepEqual(sent.clearSecrets, ['math.ocrPassword']);
  assert.equal(JSON.stringify(sent).includes('stale-environment-edit'), false);
});

test('platform secrets remain editable when no environment override is present', () => {
  prepareIntegration(configuration([]));
  const html = renderToStaticMarkup(React.createElement(IntegrationSettings));
  assert.doesNotMatch(html, /id="integration-computer\.oauthClientSecret"[^>]*disabled/);
  assert.doesNotMatch(html, /\.env 控制/);
  assert.match(html, /输入新值会替换原值/);
});

for (const enabled of ['math', 'computer']) {
  test(`a new installation can enable ${enabled} while the other platform stays unconfigured and disabled`, async () => {
    const complete = configuration([]);
    const saved = configuration([]);
    saved.config.math = { enabled: false, baseUrl: '', appId: '', stationId: 1, loginId: 2, ocrUrl: '' };
    saved.config.computer = { enabled: false, baseUrl: '', appId: '', tenantCode: '', oauthClientId: '' };
    const draft = structuredClone(saved.config);
    draft[enabled] = complete.config[enabled];
    const disabled = enabled === 'math' ? 'computer' : 'math';
    prepareIntegration(saved, { draft });
    const html = renderToStaticMarkup(React.createElement(IntegrationSettings));
    const activeSection = html.match(new RegExp(`<section[^>]*aria-labelledby="integration-${enabled}-title"[\\s\\S]*?</section>`))?.[0];
    const inactiveSection = html.match(new RegExp(`<section[^>]*aria-labelledby="integration-${disabled}-title"[\\s\\S]*?</section>`))?.[0];
    assert.ok(activeSection);
    assert.ok(inactiveSection);
    assert.equal((activeSection.match(/\srequired=""/g) || []).length, 4, 'enabled platform still requires its connection fields');
    assert.doesNotMatch(inactiveSection, /\srequired=""/, 'empty disabled-platform inputs cannot block native form submission');
    prepareIntegration(saved, { draft });
    const tree = IntegrationSettings();
    const submit = elements(tree, element => element.type === 'button' && element.props.type === 'submit')[0];
    assert.equal(submit.props.disabled, false);
    await elements(tree, element => element.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    assert.equal(fixture.calls[0].body.config[enabled].enabled, true);
    assert.deepEqual(fixture.calls[0].body.config[disabled], saved.config[disabled]);
  });
}

function prepareService(current, editing, draft) {
  fixture.states = [current ? [current] : [], editing, draft, '', '', ''];
  fixture.cursor = 0;
  fixture.calls = [];
  fixture.response = { services: current ? [current] : [] };
}
const source = {
  id: 'default', name: '默认来源', baseUrl: 'https://source.example.test', apiKeyConfigured: true,
  enabled: true, revision: 3, usesPlatformConfig: true, environmentFields: ['baseUrl', 'apiKey'],
};

test('the default YYB source locks only environment-owned fields and omits their secret edits on save', async () => {
  const draft = { name: '来源新名称', baseUrl: source.baseUrl, apiKey: 'stale-key', clearApiKey: true, enabled: false };
  prepareService(source, 'default', draft);
  const tree = YybServices({ onChanged: async () => {} });
  const inputs = elements(tree, element => element.type === 'input');
  assert.equal(inputs.find(input => input.props.type === 'url').props.disabled, true);
  assert.equal(inputs.find(input => input.props.type === 'password').props.disabled, true);
  assert.equal(inputs.find(input => input.props.type === 'password').props.value, '');
  assert.equal(inputs.find(input => input.props.type === 'checkbox' && input.props.checked === false).props.disabled, true);
  const form = elements(tree, element => element.type === 'form')[0];
  form.props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.calls[0].body, { name: '来源新名称', baseUrl: source.baseUrl, enabled: false, revision: source.revision });
  prepareService(source, 'default', draft);
  assert.match(renderToStaticMarkup(React.createElement(YybServices, { onChanged: async () => {} })), /默认服务中标记/);
});

test('new YYB sources retain independently editable addresses and credentials', async () => {
  const draft = { name: '独立来源', baseUrl: 'https://independent.example.test', apiKey: 'own-key', clearApiKey: false, enabled: true };
  prepareService(undefined, 'new', draft);
  const tree = YybServices({ onChanged: async () => {} });
  const inputs = elements(tree, element => element.type === 'input');
  assert.equal(inputs.find(input => input.props.type === 'url').props.disabled, false);
  assert.equal(inputs.find(input => input.props.type === 'password').props.disabled, false);
  elements(tree, element => element.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.calls[0], { path: '/api/admin/yyb-services', method: 'POST', body: { name: draft.name, baseUrl: draft.baseUrl, enabled: true, apiKey: draft.apiKey } });
});
