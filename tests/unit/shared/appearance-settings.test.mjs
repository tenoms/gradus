import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {appearanceDefaults} from '../../../shared/appearance.mjs';

const source=await readFile(new URL('../../../src/features/admin/appearance/use-appearance-settings.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('use-appearance-settings.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const executable=ts.transpileModule(ast.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(ast).replace(/^export\s+/, '')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
class ApiError extends Error {constructor(message,status){super(message);this.status=status;}}
const state=(revision=3,config=appearanceDefaults())=>({revision,config,updatedAt:'2026-10-30T01:00:00Z'});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function controller(request){
  const values=[],refs=[],dependencies=[],cleanup=[],events=[],calls=[];
  let cursor=0,refCursor=0,effectCursor=0,dirty=false,effects=[];
  const create=runInNewContext(`${executable}\nuseAppearanceSettings;`,{
    appearanceDefaults,structuredClone,ApiError,
    window:{dispatchEvent:event=>events.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    api:async(path,input)=>{calls.push({path,input});return request(path,input);},
    useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;dirty=true;}];},
    useRef(initial){const index=refCursor++;return refs[index]||=( {current:initial} );},
    useEffect(effect,deps){const index=effectCursor++;if(!dependencies[index]||deps.some((value,i)=>value!==dependencies[index][i]))effects.push(()=>{cleanup[index]?.();cleanup[index]=effect();});dependencies[index]=deps;},
  });
  const fixture={calls,events,render(){do{dirty=false;cursor=0;refCursor=0;effectCursor=0;effects=[];fixture.current=create();effects.forEach(effect=>effect());}while(dirty);return fixture.current;},act(method,...args){fixture.current[method](...args);fixture.render();},async flush(){await new Promise(done=>setImmediate(done));fixture.render();}};
  fixture.render();return fixture;
}

test('appearance drafts keep subjects independent and only save explicitly',async()=>{
  const f=controller(async()=>state());await f.flush();
  assert.equal(f.current.dirty,false);
  f.act('setTheme','math',{palette:'rose',mode:'dark'});
  assert.equal(f.current.draft.math.palette,'rose');assert.equal(f.current.draft.math.mode,'dark');
  assert.equal(f.current.draft.computer.palette,'teal');assert.equal(f.current.draft.computer.mode,'system');
  assert.equal(f.calls.length,1,'previews and edits do not write remotely');
  f.act('discard');assert.equal(f.current.dirty,false);assert.equal(f.current.draft.math.palette,'violet');
});

test('save sends both subjects once, locks edits and publishes the accepted server theme',async()=>{
  const gate=deferred();
  const f=controller(async(_path,input)=>input?.method==='PUT'?gate.promise:state());await f.flush();
  f.act('setTheme','computer',{palette:'blue',mode:'dark'});
  const saving=f.current.save();f.render();await f.current.save();
  f.act('setTheme','math',{palette:'rose'});
  assert.equal(f.calls.filter(call=>call.input?.method==='PUT').length,1);
  assert.equal(f.current.draft.math.palette,'violet');assert.equal(f.current.pending,true);
  const payload=JSON.parse(f.calls[1].input.body);
  assert.deepEqual(payload,{revision:3,config:{math:{palette:'violet',mode:'system'},computer:{palette:'blue',mode:'dark'}}});
  gate.resolve(state(4,payload.config));await saving;f.render();
  assert.equal(f.current.dirty,false);assert.equal(f.current.pending,false);assert.equal(f.events.length,1);
  assert.equal(f.events[0].type,'study-appearance-updated');assert.equal(f.events[0].detail.revision,4);
  assert.match(f.current.notice,/主题设置已保存/);
});

test('a version conflict preserves the draft and requires readback before another save',async()=>{
  let reads=0,writes=0;
  const f=controller(async(_path,input)=>{if(input?.method==='PUT'){writes++;throw new ApiError('版本冲突',409);}return state(++reads===1?3:8,{math:{palette:'amber',mode:'light'},computer:{palette:'teal',mode:'system'}});});await f.flush();
  f.act('setTheme','math',{palette:'rose'});await f.current.save();f.render();
  assert.equal(f.current.refreshRequired,true);assert.equal(f.current.draft.math.palette,'rose');assert.match(f.current.error,/其他页面更新/);
  await f.current.save();assert.equal(writes,1);
  f.act('reload');await f.flush();assert.equal(f.current.saved.revision,8);assert.equal(f.current.draft.math.palette,'amber');assert.equal(f.current.refreshRequired,false);
});

test('an uncertain save result requires a read without resubmitting a mutation',async()=>{
  let writes=0;
  const f=controller(async(_path,input)=>{if(input?.method==='PUT'){writes++;throw new Error('连接已断开');}return state();});await f.flush();
  f.act('setTheme','math',{mode:'dark'});await f.current.save();f.render();
  assert.equal(f.current.refreshRequired,true);assert.match(f.current.error,/未能确认是否保存成功/);
  await f.current.save();assert.equal(writes,1);
  f.act('reload');await f.flush();assert.equal(f.current.dirty,false);assert.equal(f.current.refreshRequired,false);
});

test('restoring recommendations changes only the draft until saved and failed reads can retry',async()=>{
  let reads=0;
  const f=controller(async()=>{if(++reads===1)throw new Error('暂不可用');return state(5,{math:{palette:'rose',mode:'dark'},computer:{palette:'amber',mode:'light'}});});await f.flush();
  assert.match(f.current.error,/读取失败/);assert.equal(f.current.loading,false);
  f.act('reload');await f.flush();f.act('restoreDefaults');
  assert.equal(f.current.dirty,true);assert.equal(f.current.draft.math.mode,'system');assert.equal(f.current.draft.computer.mode,'system');
  assert.equal(f.calls.filter(call=>call.input?.method==='PUT').length,0);assert.match(f.current.notice,/保存后/);
});
