// server.js â€” stable tri-game (Asteroids, Galaga, Berzerk)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.static(__dirname));
const server = http.createServer(app);

const wssAsteroids = new WebSocket.Server({ noServer: true, perMessageDeflate: false, maxPayload: 1024 * 64 });
const wssGalaga    = new WebSocket.Server({ noServer: true, perMessageDeflate: false, maxPayload: 1024 * 64 });
const wssBerzerk   = new WebSocket.Server({ noServer: true, perMessageDeflate: false, maxPayload: 1024 * 64 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname;
  const upgradeTo = (wss)=>wss.handleUpgrade(req, socket, head, (ws)=>wss.emit('connection', ws, req));
  if (route === '/ws')        upgradeTo(wssAsteroids);
  else if (route === '/galaga')  upgradeTo(wssGalaga);
  else if (route === '/berzerk') upgradeTo(wssBerzerk);
  else socket.destroy();
});

function setupHeartbeat(wss){
  wss.on('connection', (ws)=>{ ws.isAlive = true; ws.on('pong', ()=>{ ws.isAlive = true; }); });
  setInterval(()=>{ for (const ws of wss.clients){ if (ws.isAlive === false) { try{ ws.terminate(); }catch{}; continue; } ws.isAlive=false; try{ ws.ping(); }catch{} } }, 30000);
}
[ wssAsteroids, wssGalaga, wssBerzerk ].forEach(setupHeartbeat);

// Asteroids (rotation + thrust)
const ast = {
  players: {}, nextId: 1,
  createPlayer(id){ return { id, x: 400, y: 300, angle: 0, input: {} }; },
  update(){ for (const id in this.players){ const p=this.players[id],k=p.input||{};
    if(k.left) p.angle-=0.06; if(k.right) p.angle+=0.06; if(k.up){ p.x+=Math.cos(p.angle)*3.2; p.y+=Math.sin(p.angle)*3.2; }
    if(p.x<0)p.x+=800; if(p.x>800)p.x-=800; if(p.y<0)p.y+=600; if(p.y>600)p.y-=600; } },
  state(){ return { room:'lobby', players:this.players }; }
};

function createEngine(w=960,h=540){
  return {
    room:'lobby', w,h, players:{}, bullets:[], nextId:1,
    createPlayer(id){ return { id, x:w/2, y:h/2, vx:0, vy:0, speed:3.2, input:{}, fireTimer:0 }; },
    update(){ for(const id in this.players){ const p=this.players[id],k=p.input||{};
      p.vx=(k.right?1:0)-(k.left?1:0); p.vy=(k.down?1:0)-(k.up?1:0);
      p.x=(p.x+p.vx*p.speed+w)%w; p.y=(p.y+p.vy*p.speed+h)%h;
      p.fireTimer=Math.max(0,p.fireTimer-1);
      if(k.space&&p.fireTimer<=0){ this.bullets.push({ x:p.x+12,y:p.y,vx:8,vy:0,ttl:90 }); p.fireTimer=8; } }
      this.bullets=this.bullets.filter(b=>{ b.x+=b.vx; b.y+=b.vy; b.ttl--; return b.ttl>0; }); },
    state(){ return { room:'lobby', players:this.players, bullets:this.bullets }; }
  };
}
const gal = createEngine();
const bzk = createEngine();

function wire(wss, game){
  wss.on('connection', (ws) => {
    const id = game.nextId++; game.players[id] = game.createPlayer(id);
    try { ws.send(JSON.stringify({ type:'init', id, ...game.state() })); } catch {}
    ws.on('message', (msg)=>{ try{ const d=JSON.parse(msg); if(d.type==='input') game.players[id].input = d.keys || {}; }catch{} });
    ws.on('close', ()=>{ delete game.players[id]; });
    ws.on('error', ()=>{});
  });
  setInterval(()=>{ game.update(); const payload=JSON.stringify({ type:'gameState', ...game.state() });
    for (const ws of wss.clients){ if (ws.readyState===WebSocket.OPEN && ws.bufferedAmount<256*1024) ws.send(payload); } }, 1000/60);
}
wire(wssAsteroids, ast);
wire(wssGalaga,    gal);
wire(wssBerzerk,   bzk);

const PORT = process.env.PORT || 8080;
server.listen(PORT, ()=>console.log('Server listening on', PORT));
