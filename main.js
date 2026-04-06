// =========================
// Centralized tunable values
// =========================
const CONFIG = {
  canvas: { width: 960, height: 540 },
  arena: {
    left: 32,
    right: 928,
    top: 32,
    bottom: 508,
  },
  player: {
    radius: 14,
    speed: 260,
    dashSpeed: 760,
    dashDuration: 0.22,
    dashCooldown: 0.35,
    knockbackDuration: 0.32,
    knockbackSpeed: 360,
    invulnAfterDisarm: 0.8,
    spawnX: 170,
    spawnY: 280,
    color: '#74e6ff',
    unarmedColor: '#4f7b89',
    flashColor: '#ffffff',
  },
  spear: {
    radius: 8,
    recoverDistance: 20,
    ejectSpeed: 280,
    ejectTime: 0.25,
    safeMargin: 40,
    colorLoose: '#ffd27a',
    colorEmbedded: '#d6deef',
  },
  boss: {
    x: 735,
    y: 270,
    radius: 96,
    weakRadius: 24,
    weakOffset: 72,
    turnSpeed: 2.8,
    color: '#6977a8',
    weakColor: '#ff6a6a',
    hiddenWeakColor: '#2f3554',
  },
  pillars: {
    list: [
      { x: 360, y: 180, radius: 34 },
      { x: 430, y: 330, radius: 40 },
      { x: 560, y: 230, radius: 36 },
    ],
    color: '#6f85b8',
  },
  pattern: {
    aimDuration: 1.0,
    fireDuration: 0.8,
    recoverDuration: 0.9,
    projectileSpeed: 360,
    projectileRadius: 10,
    shockwaveSpeed: 260,
    shockwaveWidth: 22,
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
    spear: 'assets/images/spear.png',
  },
};

// =========================
// Helper creation / DOM / loader
// =========================
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

function circleHit(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.radius + b.radius;
  return dx * dx + dy * dy <= rr * rr;
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function createPlayer() {
  return {
    x: CONFIG.player.spawnX,
    y: CONFIG.player.spawnY,
    radius: CONFIG.player.radius,
    action: 'grounded', // grounded | dashing | knockback
    dash: null,
    knockback: null,
    dashCooldown: 0,
    invulnTimer: 0,
    flashTimer: 0,
    lastMoveDir: { x: 1, y: 0 },
  };
}

function createSpear() {
  return {
    state: 'held', // held | loose | embedded
    x: CONFIG.player.spawnX,
    y: CONFIG.player.spawnY,
    vx: 0,
    vy: 0,
    timer: 0,
    radius: CONFIG.spear.radius,
  };
}

function createBoss() {
  return {
    x: CONFIG.boss.x,
    y: CONFIG.boss.y,
    radius: CONFIG.boss.radius,
    facing: Math.PI,
    phaseStep: 'aim', // aim | fire | recover
    stepTimer: 0,
    fireShotsDone: 0,
    weakExposed: false,
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
    spear: createSpear(),
    boss: createBoss(),
    projectiles: [],
    shockwaves: [],
    assets: { images: {} },
    ui: { transient: '', timer: 0 },
  };
}

function resetBattle() {
  gameState.phase = 'playing';
  gameState.result = null;
  gameState.player = createPlayer();
  gameState.spear = createSpear();
  gameState.boss = createBoss();
  gameState.projectiles = [];
  gameState.shockwaves = [];
  gameState.ui.transient = 'Find the angle. Dash once. End it.';
  gameState.ui.timer = CONFIG.ui.transientDuration;
}

function setGameOver(result) {
  gameState.phase = 'gameover';
  gameState.result = result;
}

function isPlayerArmed() {
  return gameState.spear.state === 'held';
}

function getBossWeakPoint() {
  const boss = gameState.boss;
  const backX = Math.cos(boss.facing + Math.PI);
  const backY = Math.sin(boss.facing + Math.PI);
  return {
    x: boss.x + backX * CONFIG.boss.weakOffset,
    y: boss.y + backY * CONFIG.boss.weakOffset,
    radius: CONFIG.boss.weakRadius,
  };
}

function createBossProjectile(angle) {
  return {
    x: gameState.boss.x,
    y: gameState.boss.y,
    vx: Math.cos(angle) * CONFIG.pattern.projectileSpeed,
    vy: Math.sin(angle) * CONFIG.pattern.projectileSpeed,
    radius: CONFIG.pattern.projectileRadius,
    dead: false,
  };
}

function createShockwave() {
  return {
    x: gameState.boss.x,
    y: gameState.boss.y,
    radius: gameState.boss.radius + 6,
    width: CONFIG.pattern.shockwaveWidth,
    dead: false,
  };
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
  updateBoss(dt);
  updatePlayer(dt);
  updateSpear(dt);
  updateProjectiles(dt);
  updateShockwaves(dt);
  resolveDamage();
  checkSpearRecovery();
  cleanDynamicArrays();
  gameState.pressed.clear();
}

function updateTransient(dt) {
  if (gameState.ui.timer > 0) {
    gameState.ui.timer = Math.max(0, gameState.ui.timer - dt);
    if (gameState.ui.timer === 0) {
      gameState.ui.transient = '';
    }
  }
}

function updateBoss(dt) {
  const boss = gameState.boss;
  const p = gameState.player;
  const targetAngle = Math.atan2(p.y - boss.y, p.x - boss.x);
  boss.facing = lerpAngle(boss.facing, targetAngle, Math.min(1, CONFIG.boss.turnSpeed * dt));

  boss.stepTimer += dt;

  if (boss.phaseStep === 'aim') {
    boss.weakExposed = false;
    if (boss.stepTimer >= CONFIG.pattern.aimDuration) {
      boss.phaseStep = 'fire';
      boss.stepTimer = 0;
      boss.fireShotsDone = 0;
    }
    return;
  }

  if (boss.phaseStep === 'fire') {
    boss.weakExposed = false;

    const shouldFire = Math.floor((boss.stepTimer / CONFIG.pattern.fireDuration) * 3);
    while (boss.fireShotsDone <= shouldFire && boss.fireShotsDone < 3) {
      fireBossBurst();
      boss.fireShotsDone += 1;
    }

    if (boss.stepTimer >= CONFIG.pattern.fireDuration) {
      boss.phaseStep = 'recover';
      boss.stepTimer = 0;
      boss.weakExposed = true;
      gameState.shockwaves.push(createShockwave());
      gameState.ui.transient = 'Boss recovering: strike from behind!';
      gameState.ui.timer = 0.9;
    }
    return;
  }

  if (boss.phaseStep === 'recover') {
    boss.weakExposed = true;
    if (boss.stepTimer >= CONFIG.pattern.recoverDuration) {
      boss.phaseStep = 'aim';
      boss.stepTimer = 0;
      boss.weakExposed = false;
    }
  }
}

function fireBossBurst() {
  const base = gameState.boss.facing;
  const spread = 0.24;
  gameState.projectiles.push(createBossProjectile(base - spread));
  gameState.projectiles.push(createBossProjectile(base));
  gameState.projectiles.push(createBossProjectile(base + spread));
}

function updatePlayer(dt) {
  const p = gameState.player;

  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
  if (p.flashTimer > 0) p.flashTimer = Math.max(0, p.flashTimer - dt);
  if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

  if (p.action === 'grounded') {
    updateGroundedPlayer(dt);
    return;
  }

  if (p.action === 'dashing') {
    updateDashingPlayer(dt);
    return;
  }

  if (p.action === 'knockback') {
    updateKnockbackPlayer(dt);
  }
}

function updateGroundedPlayer(dt) {
  const p = gameState.player;
  let mx = 0;
  let my = 0;

  if (gameState.keys.has('KeyA') || gameState.keys.has('ArrowLeft')) mx -= 1;
  if (gameState.keys.has('KeyD') || gameState.keys.has('ArrowRight')) mx += 1;
  if (gameState.keys.has('KeyW') || gameState.keys.has('ArrowUp')) my -= 1;
  if (gameState.keys.has('KeyS') || gameState.keys.has('ArrowDown')) my += 1;

  const mag = Math.hypot(mx, my);
  if (mag > 0) {
    const nx = mx / mag;
    const ny = my / mag;
    p.lastMoveDir = { x: nx, y: ny };
    p.x += nx * CONFIG.player.speed * dt;
    p.y += ny * CONFIG.player.speed * dt;
  }

  constrainPlayerToArenaAndPillars();

  if (consumePressed('Space') || consumePressed('KeyK')) {
    tryStartDash();
  }
}

function updateDashingPlayer(dt) {
  const p = gameState.player;
  const dash = p.dash;

  p.x += dash.vx * dt;
  p.y += dash.vy * dt;
  dash.timer -= dt;

  constrainPlayerToArenaAndPillars(true);

  const weak = getBossWeakPoint();
  const boss = gameState.boss;

  if (gameState.boss.weakExposed && circleHit(p, weak)) {
    setGameOver('victory');
    return;
  }

  if (circleHit(p, boss)) {
    setGameOver('defeat');
    return;
  }

  if (dash.timer <= 0) {
    // decisive commitment: miss = defeat
    setGameOver('defeat');
  }
}

function updateKnockbackPlayer(dt) {
  const p = gameState.player;
  const kb = p.knockback;
  if (!kb) {
    p.action = 'grounded';
    return;
  }

  kb.timer -= dt;
  p.x += kb.vx * dt;
  p.y += kb.vy * dt;
  kb.vx *= 0.9;
  kb.vy *= 0.9;

  constrainPlayerToArenaAndPillars();

  if (kb.timer <= 0) {
    p.action = 'grounded';
    p.knockback = null;
  }
}

function constrainPlayerToArenaAndPillars(allowSlide = false) {
  const p = gameState.player;

  p.x = clamp(p.x, CONFIG.arena.left + p.radius, CONFIG.arena.right - p.radius);
  p.y = clamp(p.y, CONFIG.arena.top + p.radius, CONFIG.arena.bottom - p.radius);

  CONFIG.pillars.list.forEach((pillar) => {
    const dx = p.x - pillar.x;
    const dy = p.y - pillar.y;
    const minD = p.radius + pillar.radius;
    const d = Math.hypot(dx, dy) || 0.0001;
    if (d < minD) {
      const nx = dx / d;
      const ny = dy / d;
      p.x = pillar.x + nx * minD;
      p.y = pillar.y + ny * minD;

      if (allowSlide && p.action === 'dashing') {
        // dash clipped by obstacle => missed commitment
        setGameOver('defeat');
      }
    }
  });
}

function tryStartDash() {
  const p = gameState.player;
  if (!isPlayerArmed()) return;
  if (p.action !== 'grounded' || p.dashCooldown > 0) return;

  const dir = p.lastMoveDir;
  p.action = 'dashing';
  p.dash = {
    vx: dir.x * CONFIG.player.dashSpeed,
    vy: dir.y * CONFIG.player.dashSpeed,
    timer: CONFIG.player.dashDuration,
  };
  p.dashCooldown = CONFIG.player.dashCooldown;
}

function updateSpear(dt) {
  const spear = gameState.spear;
  const p = gameState.player;

  if (spear.state === 'held') {
    spear.x = p.x + p.lastMoveDir.x * 14;
    spear.y = p.y + p.lastMoveDir.y * 14;
    return;
  }

  if (spear.state === 'loose') {
    spear.timer -= dt;
    spear.x += spear.vx * dt;
    spear.y += spear.vy * dt;
    spear.vx *= 0.86;
    spear.vy *= 0.86;

    if (spear.timer <= 0) {
      const safe = getRecoverableSpearSpot(spear.x, spear.y);
      spear.x = safe.x;
      spear.y = safe.y;
      spear.vx = 0;
      spear.vy = 0;
      spear.state = 'embedded';
    }
  }
}

function getRecoverableSpearSpot(rawX, rawY) {
  let x = clamp(rawX, CONFIG.arena.left + CONFIG.spear.safeMargin, CONFIG.arena.right - CONFIG.spear.safeMargin);
  let y = clamp(rawY, CONFIG.arena.top + CONFIG.spear.safeMargin, CONFIG.arena.bottom - CONFIG.spear.safeMargin);

  // never allow embedding inside pillar or boss body
  CONFIG.pillars.list.forEach((pillar) => {
    const d = distance(x, y, pillar.x, pillar.y);
    const minD = pillar.radius + CONFIG.spear.recoverDistance;
    if (d < minD) {
      const nx = (x - pillar.x) / (d || 1);
      const ny = (y - pillar.y) / (d || 1);
      x = pillar.x + nx * minD;
      y = pillar.y + ny * minD;
    }
  });

  const db = distance(x, y, gameState.boss.x, gameState.boss.y);
  const minBoss = gameState.boss.radius + CONFIG.spear.recoverDistance + 10;
  if (db < minBoss) {
    const nx = (x - gameState.boss.x) / (db || 1);
    const ny = (y - gameState.boss.y) / (db || 1);
    x = gameState.boss.x + nx * minBoss;
    y = gameState.boss.y + ny * minBoss;
  }

  x = clamp(x, CONFIG.arena.left + CONFIG.spear.safeMargin, CONFIG.arena.right - CONFIG.spear.safeMargin);
  y = clamp(y, CONFIG.arena.top + CONFIG.spear.safeMargin, CONFIG.arena.bottom - CONFIG.spear.safeMargin);
  return { x, y };
}

function checkSpearRecovery() {
  const spear = gameState.spear;
  if (spear.state !== 'embedded') return;
  if (circleHit(gameState.player, { x: spear.x, y: spear.y, radius: CONFIG.spear.recoverDistance })) {
    spear.state = 'held';
    gameState.ui.transient = 'Spear recovered. You can attack safely again.';
    gameState.ui.timer = 0.9;
  }
}

function updateProjectiles(dt) {
  gameState.projectiles.forEach((proj) => {
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    if (
      proj.x < CONFIG.arena.left - 30 ||
      proj.x > CONFIG.arena.right + 30 ||
      proj.y < CONFIG.arena.top - 30 ||
      proj.y > CONFIG.arena.bottom + 30
    ) {
      proj.dead = true;
      return;
    }

    for (const pillar of CONFIG.pillars.list) {
      if (circleHit(proj, { x: pillar.x, y: pillar.y, radius: pillar.radius })) {
        proj.dead = true;
        return;
      }
    }
  });
}

function updateShockwaves(dt) {
  gameState.shockwaves.forEach((ring) => {
    ring.radius += CONFIG.pattern.shockwaveSpeed * dt;
    if (ring.radius > CONFIG.canvas.width) {
      ring.dead = true;
    }
  });
}

function resolveDamage() {
  if (gameState.phase !== 'playing') return;
  const p = gameState.player;

  for (const proj of gameState.projectiles) {
    if (!proj.dead && circleHit(p, proj)) {
      proj.dead = true;
      handlePlayerHit(proj.x, proj.y);
      return;
    }
  }

  for (const ring of gameState.shockwaves) {
    const d = distance(p.x, p.y, ring.x, ring.y);
    const onBand = d >= ring.radius - ring.width && d <= ring.radius + ring.width;
    if (onBand) {
      handlePlayerHit(ring.x, ring.y);
      return;
    }
  }
}

function handlePlayerHit(sourceX, sourceY) {
  const p = gameState.player;
  if (p.invulnTimer > 0) return;

  if (isPlayerArmed()) {
    disarmAndKnockback(sourceX, sourceY);
    return;
  }

  setGameOver('defeat');
}

function disarmAndKnockback(sourceX, sourceY) {
  const p = gameState.player;
  const spear = gameState.spear;

  const dx = p.x - sourceX;
  const dy = p.y - sourceY;
  const mag = Math.hypot(dx, dy) || 1;
  const nx = dx / mag;
  const ny = dy / mag;

  p.action = 'knockback';
  p.knockback = {
    vx: nx * CONFIG.player.knockbackSpeed,
    vy: ny * CONFIG.player.knockbackSpeed,
    timer: CONFIG.player.knockbackDuration,
  };
  p.invulnTimer = CONFIG.player.invulnAfterDisarm;
  p.flashTimer = 0.24;

  spear.state = 'loose';
  spear.x = p.x + nx * 12;
  spear.y = p.y + ny * 12;
  spear.vx = nx * CONFIG.spear.ejectSpeed;
  spear.vy = ny * CONFIG.spear.ejectSpeed;
  spear.timer = CONFIG.spear.ejectTime;

  gameState.ui.transient = 'Disarmed! Recover spear before next hit.';
  gameState.ui.timer = 1.0;
}

function cleanDynamicArrays() {
  gameState.projectiles = gameState.projectiles.filter((p) => !p.dead);
  gameState.shockwaves = gameState.shockwaves.filter((r) => !r.dead);
}

function consumePressed(code) {
  if (!gameState.pressed.has(code)) return false;
  gameState.pressed.delete(code);
  return true;
}

// =========================
// Render systems (draw only)
// =========================
function drawImageOrFallback(ctx, key, x, y, w, h, fallback) {
  const asset = gameState.assets.images[key];
  if (asset?.ok && asset.img) {
    ctx.drawImage(asset.img, x, y, w, h);
  } else {
    fallback();
  }
}

function render() {
  const ctx = dom.ctx;
  ctx.clearRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

  drawArena(ctx);
  drawPillars(ctx);
  drawBoss(ctx);
  drawProjectiles(ctx);
  drawShockwaves(ctx);
  drawSpear(ctx);
  drawPlayer(ctx);
  drawDamageFlash(ctx);
  renderUI();
}

function drawArena(ctx) {
  drawImageOrFallback(ctx, 'arena', 0, 0, CONFIG.canvas.width, CONFIG.canvas.height, () => {
    const g = ctx.createLinearGradient(0, 0, 0, CONFIG.canvas.height);
    g.addColorStop(0, '#19233b');
    g.addColorStop(1, '#0d1526');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
  });

  ctx.strokeStyle = '#3d4d70';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    CONFIG.arena.left,
    CONFIG.arena.top,
    CONFIG.arena.right - CONFIG.arena.left,
    CONFIG.arena.bottom - CONFIG.arena.top
  );
}

function drawPillars(ctx) {
  CONFIG.pillars.list.forEach((pillar) => {
    drawImageOrFallback(
      ctx,
      'pillar',
      pillar.x - pillar.radius,
      pillar.y - pillar.radius,
      pillar.radius * 2,
      pillar.radius * 2,
      () => {
        ctx.fillStyle = CONFIG.pillars.color;
        ctx.beginPath();
        ctx.arc(pillar.x, pillar.y, pillar.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    );
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

  // facing direction marker
  ctx.strokeStyle = '#cfd9f5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(boss.x, boss.y);
  ctx.lineTo(boss.x + Math.cos(boss.facing) * boss.radius, boss.y + Math.sin(boss.facing) * boss.radius);
  ctx.stroke();

  const weak = getBossWeakPoint();
  const visible = boss.weakExposed;
  drawImageOrFallback(
    ctx,
    'weak',
    weak.x - weak.radius,
    weak.y - weak.radius,
    weak.radius * 2,
    weak.radius * 2,
    () => {
      ctx.fillStyle = visible ? CONFIG.boss.weakColor : CONFIG.boss.hiddenWeakColor;
      ctx.beginPath();
      ctx.arc(weak.x, weak.y, weak.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  );

  if (visible) {
    ctx.strokeStyle = '#ffdcdc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(weak.x, weak.y, weak.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawProjectiles(ctx) {
  ctx.fillStyle = '#ffc95c';
  gameState.projectiles.forEach((proj) => {
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawShockwaves(ctx) {
  gameState.shockwaves.forEach((ring) => {
    ctx.strokeStyle = 'rgba(255, 150, 60, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawSpear(ctx) {
  const spear = gameState.spear;
  if (spear.state === 'held') return;

  drawImageOrFallback(ctx, 'spear', spear.x - 12, spear.y - 2, 24, 4, () => {
    ctx.strokeStyle = spear.state === 'loose' ? CONFIG.spear.colorLoose : CONFIG.spear.colorEmbedded;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(spear.x - 12, spear.y);
    ctx.lineTo(spear.x + 12, spear.y);
    ctx.stroke();
  });

  if (spear.state === 'embedded') {
    ctx.strokeStyle = 'rgba(255, 238, 170, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(spear.x, spear.y, CONFIG.spear.recoverDistance, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawPlayer(ctx) {
  const p = gameState.player;
  const armed = isPlayerArmed();
  const flashing = p.flashTimer > 0 && Math.floor(p.flashTimer * 40) % 2 === 0;

  let color = armed ? CONFIG.player.color : CONFIG.player.unarmedColor;
  if (flashing) color = CONFIG.player.flashColor;

  drawImageOrFallback(ctx, 'player', p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2, () => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  if (!armed) {
    ctx.fillStyle = '#ffbcbc';
    ctx.font = '12px sans-serif';
    ctx.fillText('UNARMED', p.x - 26, p.y - 20);
  }

  if (p.action === 'dashing') {
    ctx.strokeStyle = '#ffe4e4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 14, p.y - 14);
    ctx.lineTo(p.x + 14, p.y + 14);
    ctx.stroke();
  }
}

function drawDamageFlash(ctx) {
  if (gameState.player.flashTimer <= 0) return;
  ctx.fillStyle = 'rgba(255, 110, 110, 0.2)';
  ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
}

function renderUI() {
  if (gameState.phase === 'start') {
    dom.overlay.innerHTML = '<div><h1>Top-Down Dash Boss MVP</h1><p>Press Enter to Start</p></div>';
    dom.statusText.textContent = 'State: Start';
    dom.instructionText.textContent = 'Move: WASD/Arrows | Dash Attack: Space or K (committed)';
    return;
  }

  if (gameState.phase === 'playing') {
    const p = gameState.player;
    const armedLabel = isPlayerArmed() ? 'ARMED' : 'UNARMED';
    dom.overlay.innerHTML = '';
    dom.statusText.textContent = `State: Battle | ${armedLabel} | Player: ${p.action} | Boss: ${gameState.boss.phaseStep}`;
    dom.instructionText.textContent =
      gameState.ui.transient ||
      'Use pillars as cover. Attack from behind during recovery. Dash miss/body hit = defeat.';
    return;
  }

  const victory = gameState.result === 'victory';
  dom.overlay.innerHTML = victory
    ? '<div><h1 style="color:#98ff8a">Victory</h1><p>Weak point pierced. Press Enter to Restart.</p></div>'
    : '<div><h1 style="color:#ff6f6f">Defeat</h1><p>You were exposed. Press Enter to Restart.</p></div>';

  dom.statusText.textContent = victory ? 'State: Victory' : 'State: Defeat';
  dom.instructionText.textContent = 'Press Enter to restart.';
}

function gameLoop(ts) {
  const now = ts / 1000;
  gameState.dt = Math.min(0.033, now - gameState.now || 0);
  gameState.now = now;

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
