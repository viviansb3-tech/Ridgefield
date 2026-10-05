// Run with Node: node tests/application-flow.cjs
// Run with macOS JSC: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/application-flow.cjs
let readSource, runCode;
let assert;

if (typeof require !== 'undefined') {
  const {readFileSync} = require('node:fs');
  const {join} = require('node:path');
  const vm = require('node:vm');
  assert = require('node:assert/strict');
  readSource = () => readFileSync(join(__dirname, '../assets/public-application.js'), 'utf8');
  runCode = (code, context) => {
    vm.createContext(context);
    vm.runInContext(code, context);
  };
} else {
  readSource = () => readFile('assets/public-application.js');
  assert = (cond, msg) => { if (!cond) throw new Error('Assertion failed: ' + (msg || '')); };
  assert.equal = (a, b, msg) => { if (a !== b) throw new Error(`Assertion failed: ${a} !== ${b}. ${msg || ''}`); };
  runCode = (code, context) => {
    const fn = new Function('ctx', 'with(ctx){\n' + code + '\n}');
    fn(context);
  };
}

const source = readSource();
const start = source.indexOf('  form.addEventListener("submit",async e=>{');
const end = source.indexOf('\n  window.addEventListener("pageshow"', start);
async function submit({step=6,invalidStep=0,consent=true,locked=false}={}){
  let handler;
  const visited=[];
  const context={
    current:step,submitted:false,refInput:{value:'RF-TEST'},
    form:{querySelector:()=>locked?{}:null,addEventListener:(_,fn)=>{handler=fn;context.handler=fn;}},
    document:{getElementById:()=>({checked:consent})},
    showStep:n=>{context.current=n;visited.push(n)},validateStep:n=>n!==invalidStep,
    setStatus:()=>{},buildSummary:()=>{},isLocalMailMode:()=>false,
    sessionStorage:{setItem:()=>{}},clearDraft:()=>{},encodeURIComponent
  };
  runCode(source.slice(start,end),context);
  handler = context.handler || handler;
  const event={prevented:false,preventDefault(){this.prevented=true}};
  await handler(event);
  return {context,event,visited};
}
(async()=>{
  let result=await submit({step:2});
  assert(result.event.prevented);assert.equal(result.context.current,3);
  result=await submit({step:2,invalidStep:2});
  assert(result.event.prevented);assert.equal(result.context.current,2);
  for(const invalidStep of [1,2,3,4]){
    result=await submit({invalidStep});
    assert(result.event.prevented);assert.equal(result.context.current,invalidStep);
    assert(!result.context.submitted);
  }
  result=await submit({consent:false});assert(result.event.prevented);assert(!result.context.submitted);
  result=await submit({locked:true});assert(result.event.prevented);assert.equal(result.visited.length,0);
  result=await submit();assert(!result.event.prevented);assert(result.context.submitted);
  assert.equal(result.context.form.action,'/application-success.html?ref=RF-TEST');
  const log = typeof console !== 'undefined' && console.log ? console.log : print;
  log('PASS: Enter advances safely, invalid steps are revealed, consent is required, duplicate sends are blocked, valid review submits.');
})().catch(error=>{
  const err = typeof console !== 'undefined' && console.error ? console.error : print;
  err(error);
  if (typeof process !== 'undefined') process.exitCode=1;
});
