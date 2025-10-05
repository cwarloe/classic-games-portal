// server.js â€” stable tri-game (Asteroids, Galaga, Berzerk)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

// Redirect root to portal
app.get('/', (req, res) => {
  res.redirect('/portal.html');
});

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
  players: {}, asteroids: [], bullets: [], nextId: 1,
  createPlayer(id){ return { id, x: 400, y: 300, angle: 0, vx: 0, vy: 0, score: 0, input: {} }; },
  spawnAsteroids(){
    this.asteroids = [];
    for(let i=0; i<5; i++){
      this.asteroids.push({
        x: Math.random()*800, y: Math.random()*600,
        vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2,
        size: 30, rotation: Math.random()*Math.PI*2
      });
    }
  },
  update(){
    // Update players
    for (const id in this.players){
      const p=this.players[id],k=p.input||{};
      if(k.left) p.angle-=0.06;
      if(k.right) p.angle+=0.06;
      if(k.up){
        p.vx += Math.cos(p.angle)*0.15;
        p.vy += Math.sin(p.angle)*0.15;
      }
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.x += p.vx;
      p.y += p.vy;
      if(p.x<0)p.x+=800; if(p.x>800)p.x-=800;
      if(p.y<0)p.y+=600; if(p.y>600)p.y-=600;

      // Fire bullets
      if(k.space && (!p.fireTimer || p.fireTimer <= 0)){
        this.bullets.push({
          x: p.x, y: p.y,
          vx: Math.cos(p.angle)*7 + p.vx,
          vy: Math.sin(p.angle)*7 + p.vy,
          ttl: 60, owner: id
        });
        p.fireTimer = 15;
      }
      if(p.fireTimer > 0) p.fireTimer--;
    }

    // Update asteroids
    this.asteroids.forEach(a => {
      a.x += a.vx; a.y += a.vy;
      if(a.x<0)a.x+=800; if(a.x>800)a.x-=800;
      if(a.y<0)a.y+=600; if(a.y>600)a.y-=600;
      a.rotation += 0.01;
    });

    // Update bullets
    this.bullets = this.bullets.filter(b => {
      b.x += b.vx; b.y += b.vy;
      b.ttl--;
      return b.ttl > 0 && b.x >= 0 && b.x <= 800 && b.y >= 0 && b.y <= 600;
    });

    // Collision: bullets vs asteroids
    this.bullets.forEach((b, bi) => {
      this.asteroids.forEach((a, ai) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        if(Math.sqrt(dx*dx + dy*dy) < a.size){
          this.bullets.splice(bi, 1);
          this.asteroids.splice(ai, 1);
          if(this.players[b.owner]) this.players[b.owner].score += 100;

          // Split asteroid
          if(a.size > 15){
            for(let i=0; i<2; i++){
              this.asteroids.push({
                x: a.x, y: a.y,
                vx: (Math.random()-0.5)*3,
                vy: (Math.random()-0.5)*3,
                size: a.size/2,
                rotation: Math.random()*Math.PI*2
              });
            }
          }
        }
      });
    });

    // Respawn asteroids if empty
    if(this.asteroids.length === 0) this.spawnAsteroids();
  },
  state(){ return { room:'lobby', players:this.players, asteroids:this.asteroids, bullets:this.bullets }; }
};
ast.spawnAsteroids();

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
