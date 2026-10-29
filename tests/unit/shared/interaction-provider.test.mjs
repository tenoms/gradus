import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('../../../src/shared/ui/dialogs/InteractionProvider.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('InteractionProvider.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const executable=ts.transpileModule(ast.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(ast).replace(/^export\s+(?:default\s+)?/, '')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React,jsxFactory:'element'}}).outputText;
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];
function controller(component='InteractionProvider',options={children:'application'}){
  const values=[],refs=[],dependencies=[],cleanup=[];
  let cursor=0,refCursor=0,effectCursor=0,dirty=false,effects=[];
  const focus={restored:0,input:0,selected:0},origin={isConnected:true,focus:()=>{focus.restored++;}},app={inert:false},otherPortal={inert:true},backdrop={};
  const document={activeElement:origin,body:{children:[app,otherPortal,backdrop],style:{overflow:'auto'}}};
  const api=runInNewContext(`${executable}\n({InteractionProvider,InteractionDialog,confirmAction,promptAction,showMessage});`,{
    document,React:{Fragment:'fragment'},Check:'Check',CircleAlert:'CircleAlert',Info:'Info',PencilLine:'PencilLine',X:'X',useDialogFocus(){},createPortal:node=>node,
    element:(type,props,...children)=>{if(props?.ref&&type==='div'&&props.className?.includes('interaction-backdrop'))props.ref.current=backdrop;if(props?.ref&&type==='input')props.ref.current={focus:()=>{focus.input++;},select:()=>{focus.selected++;}};return {type,props:props||{},children};},
    useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;dirty=true;}];},
    useRef(initial){const index=refCursor++;return refs[index]||={current:initial};},
    useEffect(effect,deps){const index=effectCursor++;if(!dependencies[index]||deps.some((value,i)=>value!==dependencies[index][i]))effects.push(()=>{cleanup[index]?.();cleanup[index]=effect();});dependencies[index]=deps;},
  });
  const f={api,focus,document,app,otherPortal,backdrop,options,render(){do{dirty=false;cursor=0;refCursor=0;effectCursor=0;effects=[];f.tree=api[component](f.options);effects.forEach(effect=>effect());}while(dirty);return f.tree;},find:predicate=>nodes(f.tree).find(predicate),unmount(){cleanup.forEach(effect=>effect?.());}};
  f.render();return f;
}
const dialog=f=>f.find(node=>typeof node.type==='function'&&node.type.name==='InteractionDialog');

test('confirmation settles once and an already active dialog cannot duplicate the action',async()=>{
  const f=controller();const accepted=f.api.confirmAction({title:'确认交卷？'});f.render();
  assert.equal(dialog(f).props.request.options.title,'确认交卷？');
  assert.equal(await f.api.confirmAction({title:'重复交卷？'}),false);
  dialog(f).props.onFinish(true);f.render();assert.equal(await accepted,true);assert.equal(dialog(f),undefined);
  f.unmount();assert.equal(await f.api.confirmAction({title:'已卸载的页面'}),false);
});

test('cancellation and provider unmount return the original non-mutating guard results',async()=>{
  const f=controller();const cancelled=f.api.confirmAction({title:'删除？'});f.render();dialog(f).props.onFinish(false);f.render();assert.equal(await cancelled,false);
  const input=f.api.promptAction({title:'重命名',defaultValue:'旧名称'});f.render();f.unmount();assert.equal(await input,null);
});

test('prompt and message requests retain input and resolve through the common dialog',async()=>{
  const f=controller();const input=f.api.promptAction({title:'修改名称',defaultValue:'试卷一'});f.render();assert.equal(dialog(f).props.request.kind,'prompt');assert.equal(dialog(f).props.request.options.defaultValue,'试卷一');
  dialog(f).props.onFinish('试卷二');f.render();assert.equal(await input,'试卷二');
  const message=f.api.showMessage({title:'保存未完成',description:'稍后重试'});f.render();assert.equal(dialog(f).props.request.kind,'message');dialog(f).props.onFinish(undefined);f.render();await message;f.unmount();
});

test('the common dialog locks all background portals and restores prior state and focus',()=>{
  const ended=[];const f=controller('InteractionDialog',{request:{id:1,kind:'confirm',options:{title:'删除这条记录？',danger:true},origin:null},onFinish:value=>ended.push(value)});
  assert.equal(f.app.inert,true);assert.equal(f.otherPortal.inert,true);assert.equal(f.backdrop.inert,undefined);assert.equal(f.document.body.style.overflow,'hidden');
  const section=f.find(node=>node.type==='section');section.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.deepEqual(ended,[false]);
  f.unmount();assert.equal(f.app.inert,false);assert.equal(f.otherPortal.inert,true);assert.equal(f.document.body.style.overflow,'auto');
});

test('prompt focuses the existing name and submits the edited value without changing business validation',()=>{
  const ended=[],origin={isConnected:true,focus(){ended.push('focus-restored');}};
  const f=controller('InteractionDialog',{request:{id:2,kind:'prompt',options:{title:'修改名称',defaultValue:'试卷一',maxLength:120},origin},onFinish:value=>ended.push(value)});
  assert.equal(f.focus.input,1);assert.equal(f.focus.selected,1);
  f.find(node=>node.type==='input').props.onChange({target:{value:' 新试卷 '}});f.render();f.find(node=>node.type==='form').props.onSubmit({preventDefault(){}});
  assert.deepEqual(ended,[' 新试卷 ']);f.unmount();assert.equal(ended.at(-1),'focus-restored');
});
