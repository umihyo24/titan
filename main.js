// =========================
// Centralized tunable values
// =========================
const CONFIG = {
  canvas: { width: 960, height: 540 },
  arena: {
    floorY: 470,
    left: 30,
    right: 930,
  },
  player: {
    radius: 14,
    moveSpeed: 260,
    climbSpeed: 220,
    jumpDuration: 0.28,
    diveSpeed: 720,
    spawnX: 120,
    spawnY: 470,
    color: '#7ce7ff',
    dangerColor: '#ffb7b7',
  },
  pillars: {
    mountRange: 48,
    jumpRange: 230,
    exposeHeight: 200,
    list: [
      { id: 0, x: 280, width: 72, topY: 360 },
      { id: 1, x: 430, width: 72, topY: 290 },
      { id: 2, x: 590, width: 72, topY: 235 },
    ],
  },
  boss: {
    x: 810,
    y: 362,
    bodyRadius: 120,
    weakRadius: 24,
    weakOffsetX: -84,
    weakOffsetY: -54,
    color: '#6f78ab',
    weakHidden: '#313754',
    weakVisible: '#ff6363',
  },
  pattern: {
    stalkDuration: 1.2,
    shockwaveDuration: 0.9,
    recoveryDuration: 1.1,
    shockwaveSpeed: 320,
    shockwaveWidth: 20,
    boltWindup: 0.7,
    boltRadius: 16,
    boltCooldownMin: 1.4,
    boltCooldownMax: 2.4,
  },
  ui: {
    transientDuration: 1.0,
  },
};

// =========================
// Centralized assets config
// =========================
const ASSETS = {
  images: {
    player: 'assets/images/player.png',
    boss: 'assets/images/boss.png',
    pillar: 'assets/images/pillar.png',
    weak: 'assets/images/weak-point.png',
    arena: 'assets/images/arena.png',
  },
};

function getDomRefs() {
  const canvas = document.getElementById('gameCanvas');
  return {
    canvas,
    ctx: canvas.getContext('2d'),
    overlay: document.getElementById('overlay'),
    statusText: document.getElementById('statusText'),
    instructionText: document.getElementById('instructionText'),
  };
}

function loadImages(imageMap) {
  const entries = Object.entries(imageMap);
  return Promise.all(
    entries.map(([key, src]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve([key, { ok: true, img, src }]);
        img.onerror = () => resolve([key, { ok: false, img: null, src }]);
        img.src = src;
      })
    )
  ).then((pairs) => Object.fromEntries(pairs));
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function circleHit(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.radius + b.radius;
  return dx * dx + dy * dy <= rr * rr;
}

function createPlayer() {
  return {
    x: CONFIG.player.spawnX,
    y: CONFIG.player.spawnY,
    radius: CONFIG.player.radius,
    action: 'grounded', // grounded | climbing | jumping | diving
    support: 'ground', // ground | pillar
    pillarId: null,
    jump: null,
    dive: null,
    alive: true,
  };
}

function createBoss() {
  return {
    x: CONFIG.boss.x,
    y: CONFIG.boss.y,
    radius: CONFIG.boss.bodyRadius,
    phase: 'stalk', // stalk | shockwave | recovery
    timer: 0,
    weakExposed: false,
    boltTimer: randRange(CONFIG.pattern.boltCooldownMin, CONFIG.pattern.boltCooldownMax),
  };
}

function createInitialGameState() {
  return {
    phase: 'start', // start | playing | gameover
    result: null, // victory | defeat | null
    now: 0,
    dt: 0,
    keys: new Set(),
    pressed: new Set(),
    player: createPlayer(),
    boss: createBoss(),
    shockwaves: [],
    bolts: [],
    assets: { images: {} },
    ui: { transient: '', transientTimer: 0 },
  };
}

function createShockwave() {
  return {
    x: gameState.boss.x - 24,
    y: CONFIG.arena.floorY,
    radius: 28,
    width: CONFIG.pattern.shockwaveWidth,
    dead: false,
  };
}

function createBoltTarget(pillarId) {
  const pillar = CONFIG.pillars.list.find((p) => p.id === pillarId);
  return {
    x: pillar.x,
    y: pillar.topY,
    radius: CONFIG.pattern.boltRadius,
    state: 'windup', // windup | strike
    timer: 0,
    dead: false,
  };
}

function getPillarById(id) {
  return CONFIG.pillars.list.find((p) => p.id === id) || null;
}

function getBossWeakPoint() {
  return {
    x: gameState.boss.x + CONFIG.boss.weakOffsetX,
    y: gameState.boss.y + CONFIG.boss.weakOffsetY,
    radius: CONFIG.boss.weakRadius,
  };
}

function canPlayerSeeWeakPoint() {
  const player = gameState.player;
  const heightGain = CONFIG.arena.floorY - player.y;
  const highEnough = heightGain >= CONFIG.pillars.exposeHeight;
  return highEnough && gameState.boss.weakExposed;
}

function resetBattle() {
  gameState.phase = 'playing';
  gameState.result = null;
  gameState.player = createPlayer();
  gameState.boss = createBoss();
  gameState.shockwaves = [];
  gameState.bolts = [];
  gameState.ui.transient = 'Dodge first. Climb. Commit to one dive.';
  gameState.ui.transientTimer = CONFIG.ui.transientDuration;
}

function setGameOver(result) {
  gameState.phase = 'gameover';
  gameState.result = result;
}

const dom = getDomRefs();
const gameState = createInitialGameState();

function startInputHandlers() {
  window.addEventListener('keydown', (event) => {
    gameState.keys.add(event.code);
    gameState.pressed.add(event.code);

    if (event.code === 'Enter' && gameState.phase !== 'playing') {
      resetBattle();
    }
  });

  window.addEventListener('keyup', (event) => {
    gameState.keys.delete(event.code);
  });
}

// =========================
// Update systems (logic only)
// =========================
function update(dt) {
  if (gameState.phase !== 'playing') {
    gameState.pressed.clear();
    return;
  }

  updateTransient(dt);
  updateBossPattern(dt);
  updateGroundBoltSpawner(dt);
  updatePlayer(dt);
  updateShockwaves(dt);
  updateBolts(dt);
  checkDamageToPlayer();
  cleanDynamicArrays();
  gameState.pressed.clear();
}

function updateTransient(dt) {
  if (gameState.ui.transientTimer > 0) {
    gameState.ui.transientTimer = Math.max(0, gameState.ui.transientTimer - dt);
    if (gameState.ui.transientTimer === 0) {
      gameState.ui.transient = '';
    }
  }
}

function updateBossPattern(dt) {
  const boss = gameState.boss;
  boss.timer += dt;

  if (boss.phase === 'stalk') {
    boss.weakExposed = false;
    if (boss.timer >= CONFIG.pattern.stalkDuration) {
      boss.phase = 'shockwave';
      boss.timer = 0;
      gameState.shockwaves.push(createShockwave());
      gameState.ui.transient = 'Shockwave! Keep moving or climb.';
      gameState.ui.transientTimer = 0.9;
    }
    return;
  }

  if (boss.phase === 'shockwave') {
    boss.weakExposed = false;
    if (boss.timer >= CONFIG.pattern.shockwaveDuration) {
      boss.phase = 'recovery';
      boss.timer = 0;
      boss.weakExposed = true;
      gameState.ui.transient = 'Back open! From high pillar, dive now!';
      gameState.ui.transientTimer = 1.0;
    }
    return;
  }

  if (boss.phase === 'recovery') {
    boss.weakExposed = true;
    if (boss.timer >= CONFIG.pattern.recoveryDuration) {
      boss.phase = 'stalk';
      boss.timer = 0;
      boss.weakExposed = false;
    }
  }
}

function updateGroundBoltSpawner(dt) {
  const boss = gameState.boss;
  boss.boltTimer -= dt;
  if (boss.boltTimer > 0) {
    return;
  }

  const target = chooseBoltTargetPillar();
  gameState.bolts.push(createBoltTarget(target));
  boss.boltTimer = randRange(CONFIG.pattern.boltCooldownMin, CONFIG.pattern.boltCooldownMax);
}

function chooseBoltTargetPillar() {
  const player = gameState.player;
  if (player.support === 'pillar' && player.pillarId !== null) {
    return player.pillarId;
  }

  const idx = Math.floor(Math.random() * CONFIG.pillars.list.length);
  return CONFIG.pillars.list[idx].id;
}

function updatePlayer(dt) {
  const player = gameState.player;

  if (player.action === 'grounded') {
    updateGroundedPlayer(dt);
    return;
  }

  if (player.action === 'climbing') {
    updateClimbingPlayer(dt);
    return;
  }

  if (player.action === 'jumping') {
    updateJumpingPlayer(dt);
    return;
  }

  if (player.action === 'diving') {
    updateDivingPlayer(dt);
  }
}

function updateGroundedPlayer(dt) {
  const player = gameState.player;
  let dir = 0;
  if (gameState.keys.has('ArrowLeft') || gameState.keys.has('KeyA')) dir -= 1;
  if (gameState.keys.has('ArrowRight') || gameState.keys.has('KeyD')) dir += 1;

  player.x += dir * CONFIG.player.moveSpeed * dt;
  player.x = clamp(player.x, CONFIG.arena.left, CONFIG.arena.right);
  player.y = CONFIG.arena.floorY;

  if (consumePressed('KeyE')) {
    tryMountNearestPillar();
  }

  if (consumePressed('KeyK')) {
    tryStartDive();
  }
}

function updateClimbingPlayer(dt) {
  const player = gameState.player;
  const jump = player.jump;
  jump.progress += dt * (CONFIG.player.climbSpeed / Math.max(1, jump.distance));

  if (jump.progress >= 1) {
    player.x = jump.toX;
    player.y = jump.toY;
    player.action = 'grounded';
    player.support = 'pillar';
    player.pillarId = jump.toPillarId;
    player.jump = null;
    return;
  }

  const t = jump.progress;
  player.x = jump.fromX + (jump.toX - jump.fromX) * t;
  player.y = jump.fromY + (jump.toY - jump.fromY) * t;
}

function updateJumpingPlayer(dt) {
  const player = gameState.player;
  const jump = player.jump;
  jump.progress += dt / CONFIG.player.jumpDuration;

  if (jump.progress >= 1) {
    player.x = jump.toX;
    player.y = jump.toY;
    player.action = 'grounded';
    player.support = 'pillar';
    player.pillarId = jump.toPillarId;
    player.jump = null;
    return;
  }

  const t = jump.progress;
  const arc = Math.sin(Math.PI * t) * 45;
  player.x = jump.fromX + (jump.toX - jump.fromX) * t;
  player.y = jump.fromY + (jump.toY - jump.fromY) * t - arc;
}

function updateDivingPlayer(dt) {
  const player = gameState.player;
  const dive = player.dive;

  player.x += dive.vx * dt;
  player.y += dive.vy * dt;

  const weak = getBossWeakPoint();
  if (canPlayerSeeWeakPoint() && circleHit(player, weak)) {
    setGameOver('victory');
    return;
  }

  if (circleHit(player, gameState.boss)) {
    setGameOver('defeat');
    return;
  }

  if (player.y >= CONFIG.arena.floorY) {
    setGameOver('defeat');
    return;
  }

  if (player.x < 0 || player.x > CONFIG.canvas.width || player.y < 0 || player.y > CONFIG.canvas.height + 20) {
    setGameOver('defeat');
  }
}

function tryMountNearestPillar() {
  const player = gameState.player;

  if (player.support === 'pillar' && player.pillarId !== null) {
    // drop from pillar (still committed risk because boss attacks continue)
    player.support = 'ground';
    player.pillarId = null;
    player.y = CONFIG.arena.floorY;
    return;
  }

  const nearest = findNearestMountablePillar(player.x);
  if (!nearest) {
    return;
  }

  player.action = 'climbing';
  player.support = 'ground';
  player.jump = {
    fromX: player.x,
    fromY: player.y,
    toX: nearest.x,
    toY: nearest.topY,
    toPillarId: nearest.id,
    progress: 0,
    distance: Math.hypot(nearest.x - player.x, nearest.topY - player.y),
  };
}

function findNearestMountablePillar(x) {
  let best = null;
  let bestDist = Infinity;

  CONFIG.pillars.list.forEach((pillar) => {
    const dist = Math.abs(x - pillar.x);
    if (dist <= CONFIG.pillars.mountRange && dist < bestDist) {
      best = pillar;
      bestDist = dist;
    }
  });

  return best;
}

function tryPillarJump() {
  const player = gameState.player;
  if (player.support !== 'pillar' || player.pillarId === null || player.action !== 'grounded') {
    return;
  }

  let dir = 0;
  if (gameState.keys.has('ArrowLeft') || gameState.keys.has('KeyA')) dir = -1;
  if (gameState.keys.has('ArrowRight') || gameState.keys.has('KeyD')) dir = 1;
  if (dir === 0) {
    return;
  }

  const from = getPillarById(player.pillarId);
  const candidates = CONFIG.pillars.list
    .filter((pillar) => pillar.id !== from.id && (pillar.x - from.x) * dir > 0)
    .filter((pillar) => Math.abs(pillar.x - from.x) <= CONFIG.pillars.jumpRange)
    .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x));

  const to = candidates[0];
  if (!to) {
    return;
  }

  player.action = 'jumping';
  player.jump = {
    fromX: player.x,
    fromY: player.y,
    toX: to.x,
    toY: to.topY,
    toPillarId: to.id,
    progress: 0,
  };
}

function tryStartDive() {
  const player = gameState.player;

  if (player.action !== 'grounded' || player.support !== 'pillar' || !canPlayerSeeWeakPoint()) {
    return;
  }

  const weak = getBossWeakPoint();
  const dx = weak.x - player.x;
  const dy = weak.y - player.y;
  const mag = Math.hypot(dx, dy) || 1;

  player.action = 'diving';
  player.support = 'air';
  player.pillarId = null;
  player.dive = {
    vx: (dx / mag) * CONFIG.player.diveSpeed,
    vy: (dy / mag) * CONFIG.player.diveSpeed + 100,
  };
}

function updateShockwaves(dt) {
  gameState.shockwaves.forEach((ring) => {
    ring.radius += CONFIG.pattern.shockwaveSpeed * dt;
    if (ring.radius > CONFIG.canvas.width) {
      ring.dead = true;
    }
  });
}

function updateBolts(dt) {
  gameState.bolts.forEach((bolt) => {
    bolt.timer += dt;

    if (bolt.state === 'windup' && bolt.timer >= CONFIG.pattern.boltWindup) {
      bolt.state = 'strike';
      bolt.timer = 0;
      return;
    }

    if (bolt.state === 'strike' && bolt.timer >= 0.2) {
      bolt.dead = true;
    }
  });
}

function checkDamageToPlayer() {
  if (gameState.phase !== 'playing') {
    return;
  }

  const p = gameState.player;

  for (const ring of gameState.shockwaves) {
    const dist = Math.abs(p.x - ring.x);
    const onBand = dist >= ring.radius - ring.width && dist <= ring.radius + ring.width;
    const lowEnough = p.y >= CONFIG.arena.floorY - 18;
    if (onBand && lowEnough && p.action !== 'diving') {
      setGameOver('defeat');
      return;
    }
  }

  for (const bolt of gameState.bolts) {
    if (bolt.state !== 'strike') {
      continue;
    }
    if (circleHit(p, { x: bolt.x, y: bolt.y, radius: bolt.radius + 10 })) {
      setGameOver('defeat');
      return;
    }
  }
}

function cleanDynamicArrays() {
  gameState.shockwaves = gameState.shockwaves.filter((ring) => !ring.dead);
  gameState.bolts = gameState.bolts.filter((bolt) => !bolt.dead);
}

function consumePressed(code) {
  if (!gameState.pressed.has(code)) {
    return false;
  }
  gameState.pressed.delete(code);
  return true;
}

function updatePlayerActionInputs() {
  if (gameState.phase !== 'playing') {
    return;
  }

  if (consumePressed('KeyJ')) {
    tryPillarJump();
  }

  if (consumePressed('KeyK')) {
    tryStartDive();
  }
}

// =========================
// Render systems (draw only)
// =========================
function drawImageOrFallback(ctx, key, x, y, w, h, fallback) {
  const asset = gameState.assets.images[key];
  if (asset?.ok && asset.img) {
    ctx.drawImage(asset.img, x, y, w, h);
    return;
  }
  fallback();
}

function render() {
  const ctx = dom.ctx;
  ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

  drawArena(ctx);
  drawPillars(ctx);
  drawBoss(ctx);
  drawShockwaves(ctx);
  drawBolts(ctx);
  drawPlayer(ctx);
  drawHintLines(ctx);
  renderUI();
}

function drawArena(ctx) {
  drawImageOrFallback(ctx, 'arena', 0, 0, CONFIG.canvas.width, CONFIG.canvas.height, () => {
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height);
    g.addColorStop(0, '#18243a');
    g.addColorStop(1, '#0f1626');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
  });

  ctx.fillStyle = '#1f2b43';
  ctx.fillRect(0, CONFIG.arena.floorY, CONFIG.canvas.width, CONFIG.canvas.height - CONFIG.arena.floorY);

  ctx.strokeStyle = '#405073';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, CONFIG.arena.floorY);
  ctx.lineTo(CONFIG.canvas.width, CONFIG.arena.floorY);
  ctx.stroke();
}

function drawPillars(ctx) {
  CONFIG.pillars.list.forEach((pillar, index) => {
    const h = CONFIG.arena.floorY - pillar.topY;
    const left = pillar.x - pillar.width / 2;

    drawImageOrFallback(ctx, 'pillar', left, pillar.topY, pillar.width, h, () => {
      ctx.fillStyle = ['#4a5d84', '#5b6e99', '#6d82af'][index % 3];
      ctx.fillRect(left, pillar.topY, pillar.width, h);
      ctx.fillStyle = '#8fa4d1';
      ctx.fillRect(left - 4, pillar.topY - 10, pillar.width + 8, 10);
    });

    ctx.fillStyle = '#c8d5f5';
    ctx.font = '12px sans-serif';
    ctx.fillText(`H${Math.round(CONFIG.arena.floorY - pillar.topY)}`, pillar.x - 18, pillar.topY - 16);
  });
}

function drawBoss(ctx) {
  const boss = gameState.boss;

  drawImageOrFallback(
    ctx,
    'boss',
    boss.x - boss.radius,
    boss.y - boss.radius,
    boss.radius * 2,
    boss.radius * 2,
    () => {
      ctx.fillStyle = CONFIG.boss.color;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, boss.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  );

  const weak = getBossWeakPoint();
  const visible = canPlayerSeeWeakPoint();

  drawImageOrFallback(
    ctx,
    'weak',
    weak.x - weak.radius,
    weak.y - weak.radius,
    weak.radius * 2,
    weak.radius * 2,
    () => {
      ctx.fillStyle = visible ? CONFIG.boss.weakVisible : CONFIG.boss.weakHidden;
      ctx.beginPath();
      ctx.arc(weak.x, weak.y, weak.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  );

  if (visible) {
    ctx.strokeStyle = '#ffe2e2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(weak.x, weak.y, weak.radius + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawShockwaves(ctx) {
  gameState.shockwaves.forEach((ring) => {
    ctx.strokeStyle = '#ffcb5f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, Math.PI, Math.PI * 2);
    ctx.stroke();
  });
}

function drawBolts(ctx) {
  gameState.bolts.forEach((bolt) => {
    if (bolt.state === 'windup') {
      ctx.strokeStyle = '#ffd77e';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(bolt.x, bolt.y, bolt.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    ctx.strokeStyle = '#ff6a5f';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(bolt.x, bolt.y - 120);
    ctx.lineTo(bolt.x, bolt.y + 16);
    ctx.stroke();

    ctx.fillStyle = '#ff6a5f';
    ctx.beginPath();
    ctx.arc(bolt.x, bolt.y, bolt.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPlayer(ctx) {
  const p = gameState.player;
  const diving = p.action === 'diving';
  const color = diving ? CONFIG.player.dangerColor : CONFIG.player.color;

  drawImageOrFallback(ctx, 'player', p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2, () => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  if (p.action === 'diving') {
    ctx.strokeStyle = '#ffd8d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 18, p.y - 10);
    ctx.lineTo(p.x + 18, p.y + 10);
    ctx.stroke();
  }
}

function drawHintLines(ctx) {
  if (gameState.phase !== 'playing') {
    return;
  }

  const p = gameState.player;
  if (p.support === 'pillar' && p.action === 'grounded' && canPlayerSeeWeakPoint()) {
    const weak = getBossWeakPoint();
    ctx.strokeStyle = 'rgba(255, 180, 180, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(weak.x, weak.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderUI() {
  if (gameState.phase === 'start') {
    dom.overlay.innerHTML = '<div><h1>Plunge Strike MVP</h1><p>Press Enter to Start</p></div>';
    dom.statusText.textContent = 'State: Start';
    dom.instructionText.textContent = 'Move: A/D or ←/→ | E: Mount/Drop pillar | J: Jump pillar-to-pillar | K: Dive attack';
    return;
  }

  if (gameState.phase === 'playing') {
    const p = gameState.player;
    dom.overlay.innerHTML = '';

    dom.statusText.textContent = `State: Battle | Player: ${p.action}/${p.support} | Boss: ${gameState.boss.phase}`;
    dom.instructionText.textContent =
      gameState.ui.transient ||
      'Climb high pillars to reveal the back weak point. Dive is one-way: miss = instant death.';
    return;
  }

  const victory = gameState.result === 'victory';
  dom.overlay.innerHTML = victory
    ? '<div><h1 style="color:#98ff8a">Victory</h1><p>Weak-point plunge landed. Press Enter to Restart.</p></div>'
    : '<div><h1 style="color:#ff6f6f">Defeat</h1><p>Dive failed or you were hit. Press Enter to Restart.</p></div>';
  dom.statusText.textContent = victory ? 'State: Victory' : 'State: Defeat';
  dom.instructionText.textContent = 'Press Enter to retry from the start of battle.';
}

function gameLoop(ts) {
  const now = ts / 1000;
  gameState.dt = Math.min(0.033, now - gameState.now || 0);
  gameState.now = now;

  updatePlayerActionInputs();
  update(gameState.dt);
  render();

  requestAnimationFrame(gameLoop);
}

async function bootstrap() {
  gameState.assets.images = await loadImages(ASSETS.images);
  startInputHandlers();
  render();
  requestAnimationFrame(gameLoop);
}

bootstrap();
