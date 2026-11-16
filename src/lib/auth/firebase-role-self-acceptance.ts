/**
 * Runtime profile acceptance for the currently authenticated Firebase user.
 * Uses real protected HTTP endpoints and checks only response status/role.
 * Never returns credentials, House contents, IDs or personal information.
 */
type Profile='jogador'|'editor'|'narrador';
type Session={profile:Profile;memberHouseIds:string[]};
type House={id:string};
type Probe={label:string;passed:boolean;httpStatus:number|null};
type Fetcher=(url:string,init:RequestInit)=>Promise<Response>;
const ID=/^[A-Za-z0-9_-]{1,128}$/;

export async function runFirebaseRoleSelfAcceptance(args:{
  token:string;
  session:Session;
  houses:House[];
  fetcher?:Fetcher;
}):Promise<{passed:boolean;checks:Probe[];scope:Profile}>{
  const {session,token}=args;
  const checks:Probe[]=[];
  const check=(label:string,actual:number|null,expected:number)=>{
    checks.push({label,passed:actual===expected,httpStatus:actual});
  };
  if(!/^[^\s]{10,10000}$/.test(token)||!['jogador','editor','narrador'].includes(session.profile)||
     !Array.isArray(session.memberHouseIds)||
     !session.memberHouseIds.every(id=>ID.test(id))||
     !Array.isArray(args.houses)||args.houses.length>250||
     !args.houses.every(h=>typeof h?.id==='string'&&ID.test(h.id)))
    return {passed:false,checks:[{label:'Parâmetros de sessão',passed:false,httpStatus:null}],
      scope:session.profile};
  const fetcher=args.fetcher??fetch;
  async function call(action:string,houseId?:string,authenticated=true){
    try{
      const r=await fetcher('/api/firebase-cloud-read',{
        method:'POST',cache:'no-store',credentials:'omit',
        redirect:'error',headers:{
          'Content-Type':'application/json',
          ...(authenticated?{Authorization:'Bearer '+token}:{}),
        },
        body:JSON.stringify({action,...(houseId?{houseId}:{})}),
      });
      // Only session response is needed to compare the server-authorized role.
      let view:unknown=null;
      if(r.status===200&&action==='session'){
        try{view=(await r.json() as {result?:unknown}).result??null;}catch{/* fail closed */}
      }
      return {status:r.status,view};
    }catch{return {status:null,view:null};}
  }
  const anonymous=await call('session',undefined,false);
  check('Anônimo bloqueado',anonymous.status,401);
  const identity=await call('session');
  const server=identity.view;
  const matches=!!server&&typeof server==='object'&&
    !Array.isArray(server)&&
    (server as {profile?:unknown}).profile===session.profile&&
    Array.isArray((server as {memberHouseIds?:unknown}).memberHouseIds)&&
    ((server as {memberHouseIds:string[]}).memberHouseIds.length===
      session.memberHouseIds.length)&&
    session.memberHouseIds.every(id=>
      (server as {memberHouseIds:string[]}).memberHouseIds.includes(id));
  checks.push({label:'Identidade e perfil no servidor',
    passed:identity.status===200&&matches,httpStatus:identity.status});
  const ids=[...new Set(args.houses.map(h=>h.id))];
  const own=ids.find(id=>session.memberHouseIds.includes(id));
  const other=ids.find(id=>!session.memberHouseIds.includes(id));

  if(session.profile==='jogador'){
    const allowed=own?await call('getHouse',own):{status:null};
    check('Casa própria autorizada',allowed.status,200);
    const foreign=other?await call('getHouse',other):{status:null};
    check('Outra Casa bloqueada',foreign.status,403);
  }else if(session.profile==='editor'){
    const denied=ids[0]?await call('getHouse',ids[0]):{status:null};
    check('Editor não lê fichas privadas',denied.status,403);
    const calendar=await call('getCalendar');
    check('Editor sem acesso ao calendário reservado',calendar.status,403);
  }else{
    // Narrator must prove access to two distinct existing Houses, not just
    // obtain a "narrator" label in an unverified browser session.
    for(const [index,id] of ids.slice(0,2).entries()){
      const reply=await call('getHouse',id);
      check(index===0?'Narrador acessa primeira Casa':
        'Narrador acessa segunda Casa',reply.status,200);
    }
    if(ids.length<2)checks.push({
      label:'Duas Casas distintas para prova',passed:false,httpStatus:null,
    });
  }
  return {passed:checks.length>=4&&checks.every(c=>c.passed),
    checks,scope:session.profile};
}
