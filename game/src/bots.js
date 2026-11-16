import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOT_COUNT = 4;
const MAX_HEALTH = 100;
const COVER_MOVE_SPEED = 3.1;
const PUSH_MOVE_SPEED = 3.8;
const ROUTE_MOVE_SPEED = 2.8;
const ARRIVAL_DISTANCE = 0.45;
const STUCK_DISTANCE = 0.12;

const TIER_SETTINGS = [
  {
    reaction: 0.55,
    accuracy: 0.45,
    fireDelay: 0.55,
    burst: 2,
    aggression: 0.25,
    damage: 7,
    color: PALETTE.uniformDark,
  },
  {
    reaction: 0.42,
    accuracy: 0.56,
    fireDelay: 0.44,
    burst: 3,
    aggression: 0.42,
    damage: 8,
    color: PALETTE.uniformLight,
  },
  {
    reaction: 0.31,
    accuracy: 0.68,
    fireDelay: 0.34,
    burst: 3,
    aggression: 0.62,
    damage: 9,
    color: PALETTE.oliveLight,
  },
  {
    reaction: 0.22,
    accuracy: 0.79,
    fireDelay: 0.24,
    burst: 4,
    aggression: 0.8,
    damage: 10,
    color: PALETTE.accent,
  },
];

const ROUTES = [
  [[-9.4, 5.2], [-3.6, -1.4], [-6.5, -6.4]],
  [[-13.2, 7.1], [-6.7, 3.1], [-8.2, -4.2]],
  [[4.7, 6.4], [1.5, 1.4], [-4.7, -5.6]],
  [[12.4, 4.6], [4.8, 2.8], [-2.4, -4.4]],
];

const raycaster = new THREE.Raycaster();
raycaster.far = 74;
const threatPosition = new THREE.Vector3();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const muzzlePosition = new THREE.Vector3();
const impactPosition = new THREE.Vector3();
const firstDirection = new THREE.Vector3();
const secondDirection = new THREE.Vector3();

function makeBotMaterials(color) {
  return {
    uniform: new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.05 }),
    dark: new THREE.MeshStandardMaterial({ color: PALETTE.uniformDark, roughness: 0.65, metalness: 0.08 }),
    helmet: new THREE.MeshStandardMaterial({ color: PALETTE.surface, roughness: 0.48, metalness: 0.14 }),
    gun: new THREE.MeshStandardMaterial({ color: '#22262b', roughness: 0.35, metalness: 0.35 }),
  };
}

function createBotMesh(tier) {
  const bot = new THREE.Group();
  const materials = makeBotMaterials(tier.color);
  const parts = [];

  function addPart(name, width, height, depth, x, y, z, material, partName = '') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bot.add(mesh);
    parts.push(mesh);
    if (partName) {
      mesh.userData.part = partName;
      mesh.userData.bot = bot;
    }
    return mesh;
  }

  addPart('leftLeg', 0.21, 0.82, 0.24, -0.17, 0.41, 0, materials.dark);
  addPart('rightLeg', 0.21, 0.82, 0.24, 0.17, 0.41, 0, materials.dark);
  addPart('torso', 0.64, 0.75, 0.35, 0, 1.19, 0, materials.uniform, 'torso');
  addPart('head', 0.34, 0.33, 0.34, 0, 1.73, 0, materials.dark, 'head');
  addPart('helmet', 0.42, 0.17, 0.42, 0, 1.94, 0, materials.helmet);
  addPart('leftArm', 0.17, 0.65, 0.2, -0.42, 1.19, 0, materials.uniform);
  addPart('rightArm', 0.17, 0.65, 0.2, 0.42, 1.19, 0, materials.uniform);
  addPart('gun', 0.13, 0.16, 0.78, 0.24, 1.27, 0.25, materials.gun);

  return { bot, parts };
}

function hasLineOfSight(origin, target, obstacles) {
  rayDirection.copy(target).sub(origin);
  const distance = rayDirection.length();
  if (distance < 0.001) return true;
  rayDirection.normalize();
  raycaster.set(origin, rayDirection);
  raycaster.far = distance - 0.16;
  const hit = raycaster.intersectObjects(obstacles, false)[0];
  return !hit;
}

function coverIsCrowded(candidate, bots, activeIndex) {
  let crowd = 0;
  for (let index = 0; index < bots.length; index += 1) {
    if (index === activeIndex || bots[index].userData.state.dead) continue;
    const distance = Math.hypot(
      candidate[0] - bots[index].position.x,
      candidate[1] - bots[index].position.z,
    );
    if (distance < 2.1) crowd += distance < 1.2 ? 3 : 1;
  }
  return crowd;
}

function scoreCover(bot, cover, body, obstacles, bots) {
  const coverX = cover[0];
  const coverZ = cover[1];
  const botDistance = Math.hypot(coverX - bot.position.x, coverZ - bot.position.z);
  const threatDistance = Math.hypot(coverX - body.position.x, coverZ - body.position.z);
  const crowd = coverIsCrowded(cover, bots, bot.userData.index);

  firstDirection.set(coverX - bot.position.x, 0, coverZ - bot.position.z).normalize();
  secondDirection.set(body.position.x - coverX, 0, body.position.z - coverZ).normalize();
  const alignment = firstDirection.dot(secondDirection);
  const alignmentScore = 1 + alignment * 0.7;

  rayOrigin.set(coverX, 1.15, coverZ);
  threatPosition.set(body.position.x, body.position.y + Math.min(body.eye, 1.2), body.position.z);
  const exposed = hasLineOfSight(rayOrigin, threatPosition, obstacles) ? 14 : -3;

  return (
    -botDistance * 1.15
    - Math.max(0, 14 - threatDistance) * 0.65
    + alignmentScore * 3
    + exposed
    - crowd * 2.6
  );
}

function moveBot(bot, targetX, targetZ, dt, speed) {
  const deltaX = targetX - bot.position.x;
  const deltaZ = targetZ - bot.position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= ARRIVAL_DISTANCE) return 0;

  const step = Math.min(distance, speed * dt);
  bot.position.x += (deltaX / distance) * step;
  bot.position.z += (deltaZ / distance) * step;
  bot.rotation.y = Math.atan2(deltaX, deltaZ);
  return distance;
}

function fireAtPlayer(bot, body, damagePlayer, effects, audio, settings, damage) {
  muzzlePosition.copy(bot.position);
  muzzlePosition.y += bot.userData.state.crouching ? 0.92 : 1.31;
  muzzlePosition.z += 0.5;
  muzzlePosition.applyAxisAngle(new THREE.Vector3(0, 1, 0), bot.rotation.y);

  impactPosition.set(body.position.x, body.position.y + body.eye * 0.82, body.position.z);
  effects.addTracer(muzzlePosition, impactPosition);
  audio.gunshot(bot.position.distanceTo(body.position));

  const distance = bot.position.distanceTo(body.position);
  const rangePenalty = Math.min(1, Math.max(0.35, 1.1 - distance / 38));
  if (Math.random() <= settings.accuracy * rangePenalty) {
    const falloff = distance > 20 ? 0.82 : 1;
    damagePlayer(damage * falloff, bot.position.x, bot.position.z);
  }
}

function updateBotBehavior(bot, data, args) {
  const {
    dt,
    body,
    obstacles,
    cover,
    damagePlayer,
    effects,
    pressure,
    audio,
    bots,
  } = args;
  const state = data.state;
  const settings = data.settings;
  const target = new THREE.Vector3(body.position.x, body.position.y + body.eye, body.position.z);
  const eye = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
  const lineOfSight = hasLineOfSight(eye, target, obstacles);

  state.seeTimer += dt;
  state.stateTime += dt;

  if (pressure > 0.68 && state.mode !== 'push') {
    state.mode = 'push';
    state.stateTime = 0;
    state.crouching = false;
    state.fireCooldown = Math.max(state.fireCooldown, settings.reaction * 0.65);
  }

  if (state.mode === 'route') {
    const waypoint = state.route[state.routeIndex];
    const remaining = moveBot(bot, waypoint[0], waypoint[1], dt, ROUTE_MOVE_SPEED);
    if (remaining <= ARRIVAL_DISTANCE) {
      state.routeIndex += 1;
      if (state.routeIndex >= state.route.length) {
        state.mode = 'seek';
        state.stateTime = 0;
        state.coverIndex = -1;
      }
    }
    if (state.stuckTimer > 1.4) {
      state.mode = 'push';
      state.stateTime = 0;
    }
    return;
  }

  if (state.mode === 'seek') {
    if (state.coverIndex < 0) {
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestIndex = 0;
      for (let index = 0; index < cover.length; index += 1) {
        const score = scoreCover(bot, cover[index], body, obstacles, bots)
          + Math.random() * 3.2;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      state.coverIndex = bestIndex;
      state.crouching = false;
    }

    const coverPoint = cover[state.coverIndex];
    const remaining = moveBot(bot, coverPoint[0], coverPoint[1], dt, COVER_MOVE_SPEED);
    if (remaining <= ARRIVAL_DISTANCE) {
      state.mode = 'covered';
      state.stateTime = 0;
      state.crouching = true;
    } else if (state.stuckTimer > 1.2) {
      state.coverIndex = -1;
    }
    return;
  }

  if (state.mode === 'covered') {
    state.crouching = true;
    if (state.stateTime > settings.reaction * 1.5) {
      state.mode = 'peek';
      state.stateTime = 0;
      state.burstRemaining = settings.burst;
      state.crouching = false;
    }
    return;
  }

  if (state.mode === 'peek') {
    const deltaX = body.position.x - bot.position.x;
    const deltaZ = body.position.z - bot.position.z;
    bot.rotation.y = Math.atan2(deltaX, deltaZ);
    state.fireCooldown -= dt;

    if (lineOfSight && state.fireCooldown <= 0 && state.burstRemaining > 0) {
      fireAtPlayer(bot, body, damagePlayer, effects, audio, settings, settings.damage);
      state.burstRemaining -= 1;
      state.fireCooldown = settings.fireDelay;
    }

    if (state.burstRemaining <= 0) {
      state.mode = 'covered';
      state.stateTime = 0;
      state.fireCooldown = settings.fireDelay + Math.random() * settings.fireDelay;
      return;
    }

    if (state.stateTime > 2.5 && !lineOfSight) {
      state.mode = 'seek';
      state.stateTime = 0;
      state.coverIndex = -1;
    }
    return;
  }

  const deltaX = body.position.x - bot.position.x;
  const deltaZ = body.position.z - bot.position.z;
  const desiredDistance = 9 - settings.aggression * 4.5;
  const distance = Math.hypot(deltaX, deltaZ);
  const closeX = distance > desiredDistance ? body.position.x : bot.position.x + deltaX * 0.2;
  const closeZ = distance > desiredDistance ? body.position.z : bot.position.z + deltaZ * 0.2;
  moveBot(bot, closeX, closeZ, dt, PUSH_MOVE_SPEED);

  state.fireCooldown -= dt;
  if (lineOfSight && state.fireCooldown <= 0) {
    fireAtPlayer(bot, body, damagePlayer, effects, audio, settings, settings.damage);
    state.fireCooldown = settings.fireDelay + (Math.random() * 0.2);
  }
  if (pressure < 0.35 && state.stateTime > 2.5) {
    state.mode = 'seek';
    state.coverIndex = -1;
  }
}

export function createBots(scene, random) {
  const items = [];
  const hitMeshes = [];
  const bots = [];

  function reset() {
    for (const bot of items) {
      scene.remove(bot);
    }
    items.length = 0;
    hitMeshes.length = 0;
    bots.length = 0;

    for (let index = 0; index < BOT_COUNT; index += 1) {
      const settings = TIER_SETTINGS[index];
      const { bot, parts } = createBotMesh(settings);
      const route = ROUTES[index].map((point) => [point[0], point[1]]);
      const start = route[0];
      bot.userData.index = index;
      bot.userData.tier = index;
      bot.userData.state = {
        health: MAX_HEALTH,
        dead: false,
        deathTime: 0,
        mode: 'route',
        route,
        routeIndex: 1,
        coverIndex: -1,
        crouching: false,
        seeTimer: 0,
        stateTime: 0,
        burstRemaining: 0,
        fireCooldown: settings.reaction,
        stuckTimer: 0,
        lastDistance: Number.POSITIVE_INFINITY,
      };
      bot.position.set(start[0], 0, start[1]);
      bot.rotation.y = Math.atan2(-start[0], -start[1]);
      scene.add(bot);
      items.push(bot);
      bots.push(bot);
      hitMeshes.push(...parts.filter((part) => part.userData.part));
    }
  }

  function step(dt, body, worldShootables, combatActive, damagePlayer, cover, effects, pressure, audio) {
    if (dt <= 0) return;
    scene.updateMatrixWorld(true);

    for (const bot of bots) {
      const state = bot.userData.state;
      if (state.dead) {
        state.deathTime += dt;
        const fall = Math.min(1, state.deathTime / 0.55);
        bot.rotation.z = fall * (Math.PI / 2) * (bot.userData.index % 2 ? 1 : -1);
        bot.position.y = 0.08 * fall;
        bot.rotation.y += Math.sin(fall * Math.PI) * dt * 2;
        continue;
      }

      if (!combatActive || body.health <= 0) {
        state.seeTimer = 0;
        state.stuckTimer = 0;
        continue;
      }

      const playerDistance = Math.hypot(
        bot.position.x - body.position.x,
        bot.position.z - body.position.z,
      );
      const movementDelta = Math.max(0, state.lastDistance - playerDistance);
      state.stuckTimer = movementDelta > STUCK_DISTANCE ? 0 : state.stuckTimer + dt;
      state.lastDistance = playerDistance;

      const args = {
        dt,
        body,
        obstacles: worldShootables,
        cover,
        damagePlayer,
        effects,
        pressure,
        audio,
        bots,
      };
      updateBotBehavior(bot, bot, args);
      bot.position.y = state.crouching ? -0.24 : 0;
    }
  }

  function damage(mesh, amount, incomingX, incomingZ, cover, body, worldShootables) {
    const bot = mesh.userData.bot;
    if (!bot || bot.userData.state.dead) return false;

    const state = bot.userData.state;
    const headshot = mesh.userData.part === 'head';
    state.health = Math.max(0, state.health - Math.round(amount));
    state.seeTimer = 0;

    if (state.health <= 0) {
      state.dead = true;
      state.deathTime = 0;
      state.crouching = false;
      return true;
    }

    if (state.mode !== 'push' || random() > bot.userData.tier * 0.22) {
      state.mode = 'seek';
      state.stateTime = 0;
      state.coverIndex = -1;
    }

    const threatDistance = Math.hypot(
      bot.position.x - body.position.x,
      bot.position.z - body.position.z,
    );
    void incomingX;
    void incomingZ;
    void cover;
    void worldShootables;
    void threatDistance;
    return false;
  }

  function remaining() {
    return bots.filter((bot) => !bot.userData.state.dead).length;
  }

  reset();

  return {
    items,
    hitMeshes,
    damage,
    step,
    reset,
    remaining,
  };
}
