const GUILD_ID="1542010384091971614";
const STAFF_ROLES=new Set(["1542072789958131732","1542018762285252690","1561102957007601856","1561144901373268039","1561145345533157426","1561145428517593129"]);
const MAX_PROOF_SIZE=8*1024*1024;
const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const roleIds=value=>new Set((value||"").split(",").map(id=>id.trim()).filter(Boolean));
const hex=value=>Uint8Array.from(value.match(/.{1,2}/g)||[],byte=>parseInt(byte,16));
const bearer=request=>request.headers.get("Authorization")||"";

async function discord(path,env,options={}) {
  const response=await fetch(`https://discord.com/api/v10${path}`,{...options,headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,...(options.headers||{})}});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.message||`Discord returned ${response.status}`);
  return data;
}
async function db(env,path,options={}) {
  if(!env.SUPABASE_SERVICE_ROLE_KEY)throw Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  const response=await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,...(options.headers||{})}});
  const body=await response.text();
  if(!response.ok)throw Error(body||`Supabase returned ${response.status}`);
  return body?JSON.parse(body):[];
}
async function getGuildMember(id,env) {
  const response=await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${id}`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`}});
  return response.ok?response.json():null;
}
async function getStaffRole(member,env) {
  const roleIdsForMember=new Set(member.roles||[]);
  const roles=await discord(`/guilds/${GUILD_ID}/roles`,env);
  return roles.filter(role=>roleIdsForMember.has(role.id)&&STAFF_ROLES.has(role.id)).sort((a,b)=>b.position-a.position)[0]||null;
}
function approver(member,env) {
  const allowed=roleIds(env.APPROVER_ROLE_IDS);
  return allowed.size>0&&(member.roles||[]).some(role=>allowed.has(role));
}
function displayName(user) {
  if(user.discriminator&&user.discriminator!=="0")return `${user.username}#${user.discriminator}`;
  return user.username||user.global_name||"Staff member";
}
function avatarUrl(user) {
  if(user.avatar)return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id)>>22n)%6n)}.png`;
}
async function authenticate(request,env) {
  const authorization=bearer(request);
  if(!authorization.startsWith("Bearer "))return{error:"Not logged in",status:401};
  const response=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_KEY,Authorization:authorization}});
  if(!response.ok)return{error:"Supabase rejected the login token",status:401};
  const user=await response.json(),identity=user.identities?.find(item=>item.provider==="discord");
  const discordId=[identity?.identity_data?.sub,identity?.identity_data?.provider_id,identity?.identity_data?.user_id,identity?.id,user.user_metadata?.provider_id,user.user_metadata?.sub].find(value=>typeof value==="string"&&/^\d{17,20}$/.test(value));
  if(!discordId)return{error:"Discord account ID was not found; sign in again",status:403};
  const member=await getGuildMember(discordId,env);
  if(!member)return{error:"Discord account is not a Fairy Academy member",status:403};
  if(!member.roles?.some(role=>STAFF_ROLES.has(role)))return{error:"No approved staff role found",status:403};
  const topStaffRole=await getStaffRole(member,env);
  const profile={discord_id:discordId,username:displayName(member.user),avatar_url:avatarUrl(member.user),staff_rank:topStaffRole?.name||"Staff"};
  return{user,discordId,member,profile,isApprover:approver(member,env)};
}
async function saveLogin(profile,env) {
  const existing=await db(env,`staff_profiles?select=first_login&discord_id=eq.${profile.discord_id}`);
  const now=new Date().toISOString();
  await db(env,"staff_profiles?on_conflict=discord_id",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({...profile,first_login:existing[0]?.first_login||now,last_login:now})});
}
async function postMessage(env,channelId,payload,file) {
  const form=new FormData();
  form.set("payload_json",JSON.stringify(payload));
  if(file)form.set("files[0]",file,"proof");
  return discord(`/channels/${channelId}/messages`,env,{method:"POST",body:form});
}
function reportButtons(kind,id) {
  return[{type:1,components:[{type:2,style:3,label:"Approve",custom_id:`fw:approve:${kind}:${id}`},{type:2,style:4,label:"Deny",custom_id:`fw:deny:${kind}:${id}`}]}];
}
function embed(kind,profile,fields,reportId,filePresent) {
  return{title:`Fairy Warden • ${kind}`,color:kind==="MODERATION REPORT"?0x537b48:0x7b9561,fields:[{name:"Submitted by",value:`${profile.username}\n<@${profile.discord_id}>`,inline:true},...fields,{name:"Status",value:"⏳ Awaiting review",inline:true}],footer:{text:`Fairy Warden ID: ${reportId}`},timestamp:new Date().toISOString(),...(filePresent?{image:{url:"attachment://proof"}}:{})};
}
async function publishReport(request,env,kind,staff) {
  const form=await request.formData();
  const file=form.get("proof");
  if(file instanceof File&&file.size>MAX_PROOF_SIZE)return json({error:"Proof must be 8 MB or smaller"},413);
  const proof=file instanceof File&&file.size?file:null;
  const reportId=crypto.randomUUID();
  let table,channelId,fields,record;
  if(kind==="moderation") {
    const action=String(form.get("action")||"").toLowerCase(),userId=String(form.get("userId")||"").trim(),reason=String(form.get("reason")||"").trim(),note=String(form.get("note")||"").trim();
    if(!/^(ban|kick|mute|warn|note)$/.test(action)||!/^\d{17,20}$/.test(userId))return json({error:"Choose an action and enter a valid Discord user ID"},400);
    if(!reason||reason.length>1024||note.length>1024)return json({error:"Add a reason; reason and note must each be 1,024 characters or fewer"},400);
    table="moderation_logs";channelId=env.MODERATION_REVIEW_CHANNEL_ID;
    fields=[{name:"Action",value:action.toUpperCase(),inline:true},{name:"Member",value:`<@${userId}>\n`+`\`${userId}\``,inline:true},{name:"Reason",value:reason,inline:false},{name:"Additional note",value:note||"No additional note",inline:false}];
    record={id:reportId,submitted_by:staff.discordId,action,user_id:userId,reason,note,status:"pending"};
  } else {
    const start=String(form.get("start")||""),end=String(form.get("end")||""),reason=String(form.get("note")||"").trim();
    if(!start||!end||end<start)return json({error:"Add valid absence dates"},400);
    if(reason.length>1024)return json({error:"Reason must be 1,024 characters or fewer"},400);
    table="inactivity_requests";channelId=env.INACTIVITY_REVIEW_CHANNEL_ID;
    fields=[{name:"Dates",value:`${start} → ${end}`,inline:true},{name:"Reason",value:reason||"No reason provided",inline:false}];
    record={id:reportId,submitted_by:staff.discordId,start_date:start,end_date:end,reason,status:"pending"};
  }
  if(!channelId)return json({error:"The review channel has not been configured"},503);
  try {
    const created=await db(env,table,{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(record)});
    const message=await postMessage(env,channelId,{embeds:[embed(kind==="moderation"?"MODERATION REPORT":"INACTIVITY REQUEST",staff.profile,fields,reportId,Boolean(proof))],components:reportButtons(kind,reportId)},proof);
    const proofUrl=message.attachments?.[0]?.url||"";
    await db(env,`${table}?id=eq.${reportId}`,{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({discord_message_id:message.id,...(proofUrl?{proof_url:proofUrl}:{})})});
    return json({sent:true,id:created[0]?.id||reportId});
  } catch(error) {
    await db(env,`${table}?id=eq.${reportId}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>{});
    return json({error:"Could not save or post your request to Discord. Check the Worker configuration and bot channel permissions."},502);
  }
}
async function validInteraction(request,env) {
  const signature=request.headers.get("X-Signature-Ed25519"),timestamp=request.headers.get("X-Signature-Timestamp");
  if(!signature||!timestamp||!env.DISCORD_PUBLIC_KEY)return false;
  const raw=await request.clone().text();
  const key=await crypto.subtle.importKey("raw",hex(env.DISCORD_PUBLIC_KEY),{name:"Ed25519"},false,["verify"]);
  return crypto.subtle.verify({name:"Ed25519"},key,hex(signature),new TextEncoder().encode(timestamp+raw));
}
async function handleInteraction(request,env) {
  if(!(await validInteraction(request,env)))return new Response("Bad request signature",{status:401});
  const data=await request.json();
  if(data.type===1)return json({type:1});
  const custom=data.data?.custom_id||"";
  const match=custom.match(/^fw:(approve|deny):(moderation|inactivity):([0-9a-f-]{36})$/i);
  if(data.type!==3||!match)return json({type:4,data:{content:"Unsupported Fairy Warden action.",flags:64}});
  const[,decision,kind,id]=match;
  if(!approver(data.member,env))return json({type:4,data:{content:"Only the configured Owner, Community Manager/Supervisor, or Director roles can review reports.",flags:64}});
  const table=kind==="moderation"?"moderation_logs":"inactivity_requests";
  const changes={status:decision==="approve"?"approved":"denied",decided_at:new Date().toISOString(),decided_by:data.member.user.id};
  if(kind==="moderation")changes.points=decision==="approve"?5:0;
  const changed=await db(env,`${table}?id=eq.${id}&status=eq.pending`,{method:"PATCH",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(changes)});
  if(!changed.length)return json({type:4,data:{content:"This request has already been reviewed or could not be found.",flags:64}});
  const original=data.message?.embeds?.[0]||{},fields=(original.fields||[]).filter(field=>field.name!=="Status");
  fields.push({name:"Status",value:decision==="approve"?`✅ Approved by <@${data.member.user.id}>${kind==="moderation"?" · 5 leaderboard points":""}`:`❌ Denied by <@${data.member.user.id}>`,inline:false});
  const embedUpdate={...original,title:`${decision==="approve"?"Approved":"Denied"} • ${kind.toUpperCase()}`,color:decision==="approve"?0x478a50:0xa64949,fields};
  return json({type:7,data:{embeds:[embedUpdate],components:[],attachments:(data.message?.attachments||[]).map(file=>({id:file.id,filename:file.filename,description:file.description}))}});
}
async function route(request,env) {
  const url=new URL(request.url),path=url.pathname;
  if(path==="/api/discord/interactions"&&request.method==="POST")return handleInteraction(request,env);
  if(!env.DISCORD_BOT_TOKEN||!env.SUPABASE_URL||!env.SUPABASE_KEY)return json({error:"Worker environment variables are missing"},500);
  const needsAuth=path.startsWith("/api/");
  let staff=null;
  if(needsAuth) {
    const result=await authenticate(request,env);
    if(result.error)return json({error:result.error},result.status);
    staff=result;
  }
  if(path==="/api/verify"&&request.method==="GET") {
    try { await saveLogin(staff.profile,env); return json({allowed:true,approver:staff.isApprover,discordId:staff.discordId,username:staff.profile.username,avatarUrl:staff.profile.avatar_url,rank:staff.profile.staff_rank}); }
    catch { return json({error:"Could not save the staff login. Configure SUPABASE_SERVICE_ROLE_KEY and run supabase/schema.sql."},503); }
  }
  if((path==="/api/moderation"&&request.method==="POST")||(path==="/api/inactivity"&&request.method==="POST")) {
    try { return await publishReport(request,env,path==="/api/moderation"?"moderation":"inactivity",staff); }
    catch { return json({error:"Could not process the report"},502); }
  }
  if(path==="/api/moderation/history"&&request.method==="GET") {
    const rows=await db(env,`moderation_logs?select=id,action,user_id,reason,note,status,points,created_at,decided_at&submitted_by=eq.${staff.discordId}&order=created_at.desc&limit=100`);
    return json({items:rows});
  }
  if(path==="/api/leaderboard"&&request.method==="GET") {
    const rows=await db(env,"staff_leaderboard?select=discord_id,username,avatar_url,staff_rank,points,approved_actions&order=points.desc,approved_actions.desc,username.asc&limit=100");
    return json({items:rows});
  }
  if(path==="/api/online"&&request.method==="GET") {
    if(!env.PRESENCE)return json({items:[],connected:false});
    const id=env.PRESENCE.idFromName("fairy-warden-discord-presence");
    return env.PRESENCE.get(id).fetch("https://presence/online");
  }
  if(path==="/api/staff"&&request.method==="GET") {
    if(!staff.isApprover)return json({error:"Only configured managers, Owners, and Directors can access the staff directory."},403);
    const rows=await db(env,"staff_profiles?select=discord_id,username,avatar_url,staff_rank,first_login,last_login&order=last_login.desc");
    return json({items:rows});
  }
  if(path==="/api/schedule"&&request.method==="GET") {
    const rows=await db(env,"staff_schedules?select=id,discord_id,start_at,end_at,note,staff_profiles(username,avatar_url)&order=start_at.asc&limit=200");
    return json({items:rows});
  }
  if(path==="/api/schedule"&&request.method==="POST") {
    const body=await request.json(),startAt=Date.parse(body.startAt),endAt=Date.parse(body.endAt),note=String(body.note||"").trim();
    if(!Number.isFinite(startAt)||!Number.isFinite(endAt)||endAt<=startAt)return json({error:"Choose a valid schedule start and end time."},400);
    if(note.length>500)return json({error:"Schedule notes must be 500 characters or fewer."},400);
    const rows=await db(env,"staff_schedules",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({discord_id:staff.discordId,start_at:new Date(startAt).toISOString(),end_at:new Date(endAt).toISOString(),note})});
    return json({item:rows[0]},201);
  }
  if(path==="/api/schedule"&&request.method==="DELETE") {
    const id=url.searchParams.get("id")||"";
    if(!/^[0-9a-f-]{36}$/i.test(id))return json({error:"Invalid schedule entry."},400);
    const rows=await db(env,`staff_schedules?id=eq.${id}&discord_id=eq.${staff.discordId}`,{method:"DELETE",headers:{Prefer:"return=representation"}});
    return rows.length?json({deleted:true}):json({error:"Schedule entry not found."},404);
  }
  if(path==="/api/announcements"&&request.method==="GET") {
    const rows=await db(env,"announcements?select=id,title,message,created_at,created_by,staff_profiles(username,avatar_url)&order=created_at.desc&limit=100");
    return json({items:rows});
  }
  if(path==="/api/announcements"&&request.method==="POST") {
    if(!staff.isApprover)return json({error:"Only configured Community Managers/Supervisors, Owners, and Directors may post announcements."},403);
    const body=await request.json(),title=String(body.title||"").trim(),messageText=String(body.message||"").trim();
    if(!title||!messageText)return json({error:"Add both an announcement title and message."},400);
    if(title.length>256||messageText.length>3500)return json({error:"Title limit is 256 characters and message limit is 3,500 characters."},400);
    if(!env.ANNOUNCEMENT_CHANNEL_ID)return json({error:"ANNOUNCEMENT_CHANNEL_ID is not configured."},503);
    try {
      const posted=await postMessage(env,env.ANNOUNCEMENT_CHANNEL_ID,{embeds:[{title,color:0x537b48,description:messageText,author:{name:staff.profile.username,icon_url:staff.profile.avatar_url||undefined},timestamp:new Date().toISOString(),footer:{text:"Fairy Warden announcements"}}]});
      const rows=await db(env,"announcements",{method:"POST",headers:{"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({created_by:staff.discordId,title,message:messageText,discord_message_id:posted.id})});
      return json({item:rows[0]},201);
    } catch { return json({error:"Announcement could not be posted. Check the channel setting and bot permissions."},502); }
  }
  return env.ASSETS.fetch(request);
}
export default {async fetch(request,env) {
  const url=new URL(request.url);
  try { return await route(request,env); }
  catch(error) { return json({error:error.message||"Request failed"},500); }
}};
+
export class DiscordPresence {
  constructor(ctx,env) {
    this.ctx=ctx;this.env=env;this.socket=null;this.seq=null;this.ready=false;this.roleNames={};this.heartbeatTimer=null;this.reconnectTimer=null;this.members={};this.presences={};
    this.loaded=ctx.blockConcurrencyWhile(async()=>{this.members=await ctx.storage.get("staff_members")||{};this.presences=await ctx.storage.get("staff_presence")||{};this.roleNames=await ctx.storage.get("staff_role_names")||{};});
  }
  async fetch() {
    await this.loaded;
    if(!this.socket||this.socket.readyState>1)this.connect();
    const items=Object.values(this.presences).filter(person=>person.status&&person.status!=="offline").sort((a,b)=>a.username.localeCompare(b.username));
    return json({connected:this.socket?.readyState===1,ready:this.ready,items});
  }
  send(data) { if(this.socket?.readyState===1)this.socket.send(JSON.stringify(data)); }
  connect() {
    if(this.socket&&this.socket.readyState<2)return;
    if(!this.env.DISCORD_BOT_TOKEN)return;
    try {
      const socket=new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
      this.socket=socket;
      socket.addEventListener("message",event=>{this.receive(JSON.parse(event.data));});
      socket.addEventListener("close",()=>{this.socket=null;this.ready=false;this.presences={};clearInterval(this.heartbeatTimer);this.ctx.storage.put("staff_presence",this.presences);this.reconnectTimer=setTimeout(()=>this.connect(),15000);});
      socket.addEventListener("error",()=>{try{socket.close();}catch{}});
    } catch { this.socket=null; }
  }
  rememberPresence(userId,status,user) {
    const member=this.members[userId];
    if(!member||!member.roles.some(role=>STAFF_ROLES.has(role)))return;
    const account=user||member.user;
    this.presences[userId]={discord_id:userId,username:account?.username||account?.global_name||member.username||"Staff",avatar_url:account?avatarUrl(account):"",staff_rank:member.staff_rank||"Staff",status:status||"offline"};
    if(!status||status==="offline")delete this.presences[userId];
  }
  rememberMember(member) {
    const user=member.user||{};
    const id=user.id;
    if(!id)return;
    const staffRoles=(member.roles||[]).filter(role=>STAFF_ROLES.has(role));
    if(!staffRoles.length){delete this.members[id];delete this.presences[id];return;}
    const highest=staffRoles.sort((a,b)=>(this.roleNames[b]?.position||0)-(this.roleNames[a]?.position||0))[0];
    this.members[id]={roles:staffRoles,user,staff_rank:this.roleNames[highest]?.name||"Staff"};
  }
  async receive(payload) {
    if(payload.s!==null&&payload.s!==undefined)this.seq=payload.s;
    if(payload.op===10) {
      const interval=payload.d.heartbeat_interval;
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer=setInterval(()=>this.send({op:1,d:this.seq}),interval);
      this.send({op:2,d:{token:this.env.DISCORD_BOT_TOKEN,intents:259,properties:{os:"linux",browser:"fairy-warden",device:"fairy-warden"},shard:[0,1]}});
      return;
    }
    if(payload.op===1){this.send({op:1,d:this.seq});return;}
    if(payload.op===7||payload.op===9){try{this.socket?.close();}catch{}return;}
    if(payload.op!==0)return;
    const event=payload.t,data=payload.d;
    if(event==="READY") {
      const roleList=await discord(`/guilds/${GUILD_ID}/roles`,this.env);
      this.roleNames=Object.fromEntries(roleList.map(role=>[role.id,{name:role.name,position:role.position}]));
      await this.ctx.storage.put("staff_role_names",this.roleNames);
      this.ready=true;
      this.send({op:8,d:{guild_id:GUILD_ID,query:"",limit:1000,presences:true}});
    } else if(event==="GUILD_CREATE") {
      for(const member of data.members||[])this.rememberMember(member);
      for(const presence of data.presences||[])this.rememberPresence(presence.user.id,presence.status,presence.user);
      await this.ctx.storage.put("staff_members",this.members);await this.ctx.storage.put("staff_presence",this.presences);
    } else if(event==="GUILD_MEMBERS_CHUNK") {
      for(const member of data.members||[])this.rememberMember(member);
      for(const presence of data.presences||[])this.rememberPresence(presence.user.id,presence.status,presence.user);
      await this.ctx.storage.put("staff_members",this.members);await this.ctx.storage.put("staff_presence",this.presences);
    } else if(event==="GUILD_MEMBER_ADD"||event==="GUILD_MEMBER_UPDATE") {
      this.rememberMember(data);await this.ctx.storage.put("staff_members",this.members);
      if(data.user?.id&&this.presences[data.user.id])this.rememberPresence(data.user.id,this.presences[data.user.id].status,data.user);
      await this.ctx.storage.put("staff_presence",this.presences);
    } else if(event==="GUILD_MEMBER_REMOVE") {
      delete this.members[data.user.id];delete this.presences[data.user.id];
      await this.ctx.storage.put("staff_members",this.members);await this.ctx.storage.put("staff_presence",this.presences);
    } else if(event==="PRESENCE_UPDATE"&&data.guild_id===GUILD_ID) {
      const userId=data.user?.id;
      if(userId) {
        if(data.roles?.length)this.rememberMember({user:data.user,roles:data.roles});
        this.rememberPresence(userId,data.status,data.user);
        await this.ctx.storage.put("staff_members",this.members);await this.ctx.storage.put("staff_presence",this.presences);
      }
    }
  }
}
