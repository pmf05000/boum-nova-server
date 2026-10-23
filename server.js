'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const ROOM_TTL_MS = 1000 * 60 * 35;
const RESUME_GRACE_MS = 30000;
const MAX_STATE_BUFFER = 128 * 1024; // Do not queue old frames on slow links.
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'});
    res.end(JSON.stringify({ok:true, service:'BOUM NOVA', version:'1.3.0', rooms:rooms.size}));
  } else { res.writeHead(404); res.end('Not found'); }
});
const wss = new WebSocketServer({server, path:'/ws', maxPayload:140000});

function send(ws, object) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Dropping an obsolete snapshot is preferable to building seconds of lag.
  if (object.type === 'state' && ws.bufferedAmount > MAX_STATE_BUFFER) return;
  try { ws.send(JSON.stringify(object)); } catch (_) { /* cleanup on close */ }
}
function error(ws, message) {send(ws,{type:'error',message});}
function roomInfo(room) {
  const players = {};
  for (let slot=0; slot<4; slot++) {
    const p=room.players.get(slot);
    if(p) players[String(slot)]={hero:p.hero, skin:p.skin, look:p.look};
  }
  return {type:'room',code:room.code,status:room.status,mode:room.mode,players};
}
function broadcast(room,obj,omit=null) {
  for (const p of room.players.values()) if(p.ws!==omit) send(p.ws,obj);
}
function makeCode() {
  for(let attempt=0;attempt<20;attempt++) {
    let code='';
    for(let i=0;i<6;i++) code+=alphabet[crypto.randomInt(alphabet.length)];
    if(!rooms.has(code)) return code;
  }
  throw new Error('Room codes exhausted');
}
function detach(ws, intentional = false) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  const p = room.players.get(ws.slot);
  if (!p || p.ws !== ws) return;
  room.lastActive = Date.now();
  // A brief Wi-Fi interruption must not immediately remove the fighter.
  if (!intentional && room.status === 'playing') {
    p.ws = null;
    if (ws.slot !== 0) {
      broadcast(room, {type:'player_stalled',slot:ws.slot});
    } else {
      broadcast(room, {type:'host_stalled'});
    }
    p.resumeTimer = setTimeout(() => removePlayer(room, ws.slot), RESUME_GRACE_MS);
    p.resumeTimer.unref?.();
    return;
  }
  removePlayer(room, ws.slot);
}
function removePlayer(room, slot) {
  const p = room.players.get(slot);
  if (!p) return;
  clearTimeout(p.resumeTimer);
  room.players.delete(slot);
  if (slot === 0) {
    room.status = 'closed';
    broadcast(room,{type:'closed',reason:'L’hôte a quitté le salon.'});
    for (const other of room.players.values()) {
      if (other.ws) {other.ws.room = null;other.ws.close(1000,'host disconnected');}
    }
    rooms.delete(room.code);
  } else {
    broadcast(room, roomInfo(room));
    if (room.status === 'playing') broadcast(room,{type:'player_left',slot});
  }
}
function resume(ws, data) {
  const room = rooms.get(String(data.code||'').trim().toUpperCase());
  const slot = Number(data.slot);
  const player = room?.players.get(slot);
  if (!room || room.status !== 'playing' || !player || player.ws ||
      !Number.isInteger(slot) || typeof data.token !== 'string' ||
      data.token.length !== 32 || player.token !== data.token) {
    return error(ws,'Reconnexion refusée : salon expiré ou jeton invalide.');
  }
  clearTimeout(player.resumeTimer);
  player.resumeTimer = null;
  player.ws = ws;
  ws.room = room;
  ws.slot = slot;
  room.lastActive = Date.now();
  send(ws,{type:'welcome',code:room.code,slot,host:slot===0,
    token:player.token,room:roomInfo(room),resumed:true});
  if (room.lastSnapshot) {
    send(ws,{type:'state',state:{...room.lastSnapshot,board:room.lastBoard}});
  }
  broadcast(room, roomInfo(room));
  if (slot !== 0) send(room.players.get(0)?.ws, {type:'player_resumed',slot});
}
// A bounded appearance-only payload. No wardrobe item affects gameplay.
const cosmeticSlots = ['finish','outfit','armor','head','back','eyes','emblem','boots','aura'];
function cleanLook(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) return null;
  const colors = value.colors;
  const items = value.items;
  if (!Array.isArray(colors)||colors.length!==4||!items||
      typeof items!=='object'||Array.isArray(items)) return null;
  const cleanColors = colors.map(n => Number.isInteger(n)&&n>=0&&n<=0xffffffff ? n : 0xff777777);
  const cleanItems = {};
  for(const slot of cosmeticSlots){
    const id = items[slot];
    cleanItems[slot] = typeof id==='string'&&
      new RegExp('^'+slot+'_[0-9]{1,2}$').test(id) ? id : slot+'_0';
  }
  return {items:cleanItems, colors:cleanColors, enabled:value.enabled===true};
}
function cleanSkin(value) {
  return Number.isInteger(value)&&value>=0&&value<3 ? value : 0;
}
function attach(ws,room,slot,hero,look,skin) {
  ws.room=room;ws.slot=slot;
  const token=crypto.randomBytes(16).toString('hex');
  room.players.set(slot,{ws,hero,look:cleanLook(look),skin:cleanSkin(skin),token,
    resumeTimer:null});
  room.lastActive=Date.now();
  send(ws,{type:'welcome',code:room.code,slot,host:slot===0,
    token,room:roomInfo(room)});
  broadcast(room,roomInfo(room));
}
function validHero(value) {return Number.isInteger(value) && value>=0 && value<6;}
function handle(ws,data) {
  if(!data||typeof data!=='object'||Array.isArray(data)) return error(ws,'Message incorrect.');
  const type=data.type;
  if(!ws.room) {
    if (type === 'resume') return resume(ws,data);
    if((type!=='create'&&type!=='join') || !validHero(data.hero))
      return error(ws,'Crée ou rejoins un salon avec un héros valide.');
    if(type==='create') {
      const code=makeCode();
      const room={code,players:new Map(),status:'lobby',mode:data.mode==='duel'?'duel':'arena',
        lastActive:Date.now(),lastSnapshot:null,
        seed:0,theme:0,lastStateAt:0,lastBoard:null};
      rooms.set(code,room);attach(ws,room,0,data.hero,data.look,data.skin);return;
    }
    const code=String(data.code||'').trim().toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return error(ws,'Code incorrect.');
    const room=rooms.get(code);
    if(!room||room.status!=='lobby')return error(ws,'Salon introuvable ou déjà lancé.');
    const available = room.mode === 'duel' ? [1] : [1,2,3];
    const slot=available.find(i=>!room.players.has(i));
    if(slot===undefined)return error(ws,'Salon complet.');
    attach(ws,room,slot,data.hero,data.look,data.skin);return;
  }
  const room=ws.room;room.lastActive=Date.now();
  if(type==='probe') {
    if (Number.isSafeInteger(data.stamp)) send(ws,{type:'probe_ack',stamp:data.stamp});
    return;
  }
  if(type==='leave') {detach(ws,true);ws.close(1000,'left');return;}
  if(type==='start') {
    if(ws.slot!==0)return error(ws,'Seul l’hôte lance le jeu.');
    if(room.status!=='lobby')return error(ws,'Partie déjà lancée.');
    if(room.mode==='duel' && room.players.size!==2)
      return error(ws,'Le duel nécessite deux joueurs connectés.');
    room.seed=crypto.randomInt(1,1e9);room.theme=crypto.randomInt(5);room.status='playing';
    broadcast(room,{type:'start',code:room.code,seed:room.seed,theme:room.theme,
      mode:room.mode,players:roomInfo(room).players});return;
  }
  if(room.status!=='playing')return;
  if(type==='input' && ws.slot!==0) {
    // Only the sender's own slot is used: clients cannot impersonate each other.
    const dx=Number(data.dx),dy=Number(data.dy);
    if(!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)>1||Math.abs(dy)>1||
       (Math.abs(dx)+Math.abs(dy)>1))return;
    send(room.players.get(0)?.ws,{type:'input',slot:ws.slot,dx,dy});
  } else if(type==='action' && ws.slot!==0 && ['bomb','push'].includes(data.action)) {
    // Game engine validates range, cooldown and bomb capacity on host.
    const now=Date.now();
    if(ws.actionAt && now-ws.actionAt<70)return;
    ws.actionAt=now;
    send(room.players.get(0)?.ws,{type:'action',slot:ws.slot,action:data.action});
  } else if(type==='state'&&ws.slot===0) {
    const now=Date.now();
    if(now-room.lastStateAt<40)return; // <= ~25 snapshots/s
    if(!data.state||typeof data.state!=='object'||Array.isArray(data.state))return;
    room.lastStateAt=now;room.lastSnapshot=data.state;
    if(Array.isArray(data.state.board)) room.lastBoard=data.state.board;
    broadcast(room,{type:'state',state:data.state},ws);
  }
}
wss.on('connection',(ws)=>{
  ws.isAlive=true;ws.actionAt=0;
  ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',(buffer)=>{
    try { handle(ws,JSON.parse(buffer.toString('utf8'))); }
    catch(e) {error(ws,'Message JSON invalide.');}
  });
  ws.on('close',()=>detach(ws));
  ws.on('error',()=>detach(ws));
});
const heartbeat=setInterval(()=>{
  const now=Date.now();
  for(const ws of wss.clients){
    if(!ws.isAlive){ws.terminate();continue;}
    ws.isAlive=false;
    try{ws.ping();}catch(_){ws.terminate();}
  }
  for(const room of rooms.values()) if(now-room.lastActive>ROOM_TTL_MS){
    broadcast(room,{type:'closed',reason:'Salon expiré.'});
    for(const p of room.players.values()) {clearTimeout(p.resumeTimer);if(p.ws){p.ws.room=null;p.ws.close(1000,'expired');}}
    rooms.delete(room.code);
  }
},30000);
heartbeat.unref();
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`BOUM NOVA server listening on ${PORT}`));
module.exports={server,wss,rooms,handle,detach,removePlayer,resume};
