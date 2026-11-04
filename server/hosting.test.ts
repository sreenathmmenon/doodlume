import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {hostingConfig,installHostingBoundary} from './hosting.js';
import {installCapture} from './capture.js';
import {failureLocation} from './diagnostics.js';

test('operational failure logging contains source locations without messages or private paths',()=>{
  const error=new Error('private provider body and image');
  error.stack='Error: private provider body and image\n    at compile (/app/server/interpret.ts:42:7)\n    at loader (/private/credentials/owner.js:1:2)';
  assert.deepEqual(failureLocation(error),{type:'Error',frames:['server/interpret.ts:42:7']});
  assert.deepEqual(failureLocation({message:'private'}),{type:'UnknownError',frames:[]});
});

test('hosting requires an explicit HTTPS origin and retains the existing local boundary',()=>{
  assert.throws(()=>hostingConfig({NODE_ENV:'production'}),/PUBLIC_ORIGIN/);
  for(const origin of ['http://demo.example','https://user:password@demo.example','https://demo.example/path','https://demo.example?x=1','https://demo.example/#x'])
    assert.throws(()=>hostingConfig({PUBLIC_ORIGIN:origin}));
  assert.throws(()=>hostingConfig({PORT:'abc'}),/PORT/);
  assert.equal(hostingConfig({API_PORT:'5192'}).host,'127.0.0.1');
  assert.equal(hostingConfig({RAILWAY_PUBLIC_DOMAIN:'doodlume.up.railway.app',PORT:'8080'}).publicOrigin,'https://doodlume.up.railway.app');
});

test('public API rejects alien Host/Origin, allows fixed probes, and pairs phones on HTTPS without a LAN listener',async()=>{
  const app=Fastify();
  const config=hostingConfig({PUBLIC_ORIGIN:'https://studio.example',PORT:'8080'});
  installHostingBoundary(app,config);
  app.get('/healthz',async()=>({ok:true}));
  app.get('/api/status',async()=>({configured:false}));
  installCapture(app,'/missing-test-build',8080,config.publicOrigin);
  try{
    const headers={host:'studio.example',origin:'https://studio.example'};
    assert.equal((await app.inject({url:'/api/status',headers})).statusCode,200);
    for(const bad of [{...headers,host:'evil.example'},{...headers,origin:'https://evil.example'},
      {...headers,origin:'null'},{...headers,host:'localhost:8080'}])
      assert.equal((await app.inject({url:'/api/status',headers:bad})).statusCode,403);
    assert.equal((await app.inject({url:'/healthz',headers:{host:'internal.railway'}})).statusCode,200);
    assert.equal((await app.inject({url:'/api/status',headers:{host:'internal.railway'}})).statusCode,403);
    const result=await app.inject({method:'POST',url:'/api/pairings',headers,payload:{context:{purpose:'create',name:'A drawing'},network:true}});
    assert.equal(result.statusCode,200,result.body);
    const pair=result.json();
    assert.equal(pair.network,false);
    assert.equal(pair.links.length,1);
    assert.match(pair.links[0].url,/^https:\/\/studio\.example\/capture\/[a-f0-9]{32}#/);
    assert.equal(result.headers['cache-control'],'no-store');
    assert.equal(result.headers['x-content-type-options'],'nosniff');
    assert.equal((await app.inject({url:`/api/pairings/${pair.id}`,headers:{...headers,authorization:`Bearer ${pair.ownerToken}`}})).statusCode,200);
  }finally{await app.close();}
});
