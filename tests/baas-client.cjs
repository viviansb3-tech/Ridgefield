const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('assets/rf-baas.js', 'utf8');
(async () => {
  const requests=[]; const store=new Map(); let mode='signin'; let refreshes=0;
  const context={ console,Headers,AbortSignal,Event,Date,JSON,Error,
    sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    window:{RidgefieldBaasConfig:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'},dispatchEvent:()=>{}},
    fetch:async(url,options)=>{
      requests.push({url,options});
      if(url.includes('grant_type=password'))return Response.json({access_token:'access',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)+3600});
      if(url.includes('grant_type=refresh_token')){refreshes++;await new Promise(r=>setTimeout(r,10));return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_at:Math.floor(Date.now()/1000)+3600});}
      if(mode==='expired')return Response.json({ok:false,error:'expired'},{status:401});
      return Response.json({ok:true});
    }
  };
  vm.runInNewContext(source,context);const B=context.window.RidgefieldBaas;
  await assert.rejects(B.request('/admin/summary',{authenticated:true}),/sign in/);
  await B.signIn(' staff@example.com ',' password preserved ');
  assert.equal(JSON.parse(requests[0].options.body).password,' password preserved ');
  assert(B.hasSession());await B.request('/send-enquiry',{method:'POST'});
  assert(!requests.at(-1).options.headers.has('authorization'));
  await B.request('/admin/summary',{authenticated:true});
  assert.equal(requests.at(-1).options.headers.get('Authorization'),'Bearer access');
  const old=JSON.parse(store.get('rf_supabase_session'));old.expires_at=1;store.set('rf_supabase_session',JSON.stringify(old));
  await Promise.all([B.request('/me',{authenticated:true}),B.request('/me',{authenticated:true})]);assert.equal(refreshes,1);
  mode='expired';await B.request('/me',{authenticated:true});assert(!B.hasSession());
  await assert.rejects(B.request('//malicious.example'),/Invalid service path/);
  console.log('PASS: authenticated requests, public requests, preserved passwords, concurrent refresh and expired-session clearing');
})().catch(e=>{console.error(e);process.exitCode=1});
