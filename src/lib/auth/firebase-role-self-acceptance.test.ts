import {describe,expect,it} from 'vitest';
import {runFirebaseRoleSelfAcceptance} from './firebase-role-self-acceptance';

const houses=[{id:'house-a'},{id:'house-b'}];
type Profile='narrador'|'jogador'|'editor';
function fixture(role:Profile,memberHouseIds:string[]){
  const session={profile:role,memberHouseIds};
  const requests:{action:string;hasToken:boolean;houseId:string|null}[]=[];
  const fetcher=async(_url:string,init:RequestInit)=>{
    const body=JSON.parse(String(init.body)) as {action:string;houseId?:string};
    const headers=new Headers(init.headers);
    const hasToken=headers.get('authorization')==='Bearer token-from-active-user';
    requests.push({action:body.action,hasToken,houseId:body.houseId??null});
    if(!hasToken)return new Response('{}',{status:401});
    if(body.action==='session')return Response.json({result:{
      authenticated:true,profile:role,memberHouseIds,readOnly:true,
    }});
    if(body.action==='listMailbox')return new Response('{}',{
      status:role==='editor'?403:200,
    });
    if(body.action==='getCalendar')return new Response('{}',{
      status:role==='editor'?403:200,
    });
    if(body.action==='getHouse'){
      const allowed=role==='narrador'||role==='jogador'&&
        memberHouseIds.includes(body.houseId??'');
      return new Response('{}',{status:allowed?200:403});
    }
    return new Response('{}',{status:400});
  };
  return {session,requests,fetcher,
    run:()=>runFirebaseRoleSelfAcceptance({
      token:'token-from-active-user',session,houses,fetcher,
    }),
  };
}
describe('Firebase Cloud live role acceptance preflight',()=>{
  it('accepts player A only after positive A and denial of B',async()=>{
    const f=fixture('jogador',['house-a']);
    const result=await f.run();
    expect(result.passed).toBe(true);
    expect(f.requests).toContainEqual({action:'getHouse',hasToken:true,houseId:'house-a'});
    expect(f.requests).toContainEqual({action:'getHouse',hasToken:true,houseId:'house-b'});
    expect(f.requests[0]).toMatchObject({action:'session',hasToken:false});
    expect(f.requests).toContainEqual({
      action:'listMailbox',hasToken:true,houseId:null,
    });
  });
  it('accepts player B only after positive B and denial of A',async()=>{
    const f=fixture('jogador',['house-b']);
    expect((await f.run()).passed).toBe(true);
    expect(f.requests.some(x=>x.houseId==='house-a')).toBe(true);
  });
  it('Narrator must access two distinct Houses and reject anonymous',async()=>{
    const f=fixture('narrador',[]);
    const result=await f.run();
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(5);
    expect(f.requests.filter(x=>x.action==='getHouse')).toHaveLength(2);
  });
  it('Editor cannot read private House sheets or calendar',async()=>{
    const f=fixture('editor',[]);
    const result=await f.run();
    expect(result.passed).toBe(true);
    expect(f.requests.some(x=>x.action==='getCalendar')).toBe(true);
    expect(f.requests.some(x=>x.action==='listMailbox'&&x.hasToken)).toBe(true);
  });
  it('fails closed when a foreign House accidentally responds 200',async()=>{
    const f=fixture('jogador',['house-a']);
    const result=await runFirebaseRoleSelfAcceptance({
      token:'token-from-active-user',session:f.session,houses,
      fetcher:async(url,init)=>{
        const body=JSON.parse(String(init.body)) as {action:string};
        const auth=new Headers(init.headers).has('authorization');
        if(!auth)return new Response('{}',{status:401});
        if(body.action==='session')return Response.json({result:f.session});
        return new Response('{}',{status:200});
      },
    });
    expect(result.passed).toBe(false);
    expect(result.checks.some(x=>!x.passed)).toBe(true);
  });
  it('a player cannot pass when mailbox is denied despite correct House scope',async()=>{
    const f=fixture('jogador',['house-a']);
    const report=await runFirebaseRoleSelfAcceptance({
      token:'token-from-active-user',session:f.session,houses,
      fetcher:async(url,init)=>{
        const body=JSON.parse(String(init.body)) as {action:string};
        if(body.action==='listMailbox')
          return new Response('{}',{status:403});
        return f.fetcher(url,init);
      },
    });
    expect(report.passed).toBe(false);
    expect(report.checks.some(x=>
      x.label==='Próprias missivas autorizadas'&&!x.passed)).toBe(true);
  });
  it('editor cannot pass if mailbox accidentally allows private data',async()=>{
    const f=fixture('editor',[]);
    const report=await runFirebaseRoleSelfAcceptance({
      token:'token-from-active-user',session:f.session,houses,
      fetcher:async(url,init)=>{
        const body=JSON.parse(String(init.body)) as {action:string};
        if(body.action==='listMailbox')
          return new Response('{}',{status:200});
        return f.fetcher(url,init);
      },
    });
    expect(report.passed).toBe(false);
    expect(report.checks.some(x=>
      x.label==='Editor sem acesso às missivas privadas'&&!x.passed)).toBe(true);
  });
  it('unavailable Cloud 503, missing Houses and invalid token never imply GO',async()=>{
    const f=fixture('jogador',['house-a']);
    const broken=await runFirebaseRoleSelfAcceptance({
      token:'token-from-active-user',session:f.session,houses,
      fetcher:async()=>new Response('{}',{status:503}),
    });
    expect(broken.passed).toBe(false);
    const missing=await runFirebaseRoleSelfAcceptance({
      token:'token-from-active-user',session:f.session,houses:[{id:'house-a'}],
      fetcher:f.fetcher,
    });
    expect(missing.passed).toBe(false);
    const invalid=await runFirebaseRoleSelfAcceptance({
      token:'short',session:f.session,houses,fetcher:f.fetcher,
    });
    expect(invalid.passed).toBe(false);
  });
  it('never includes credential, House ID, or private document contents in output',async()=>{
    const f=fixture('jogador',['house-a']);
    const result=await f.run();
    const text=JSON.stringify(result);
    expect(text).not.toContain('token-from-active-user');
    expect(text).not.toContain('house-a');
    expect(text).not.toContain('house-b');
  });
});
