import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GROUND_WIDTH = 40;
const GROUND_DEPTH = 24;
const WALL_HEIGHT = 5.4;
const WALL_THICKNESS = 0.9;
const PLATFORM_HEIGHT = 2.4;
const PLATFORM_WIDTH = 12;
const PLATFORM_DEPTH = 7;
const RAMP_WIDTH = 3;
const RAMP_STEP_COUNT = 8;
const RAMP_STEP_HEIGHT = PLATFORM_HEIGHT / RAMP_STEP_COUNT;
const RAMP_STEP_DEPTH = 1;

const CRATES = [
  [-11.4, 4.2],
  [-11.4, 5.9],
  [-11.8, 7.6],
  [-4.4, 4.6],
  [-3.1, 8.5],
  [4.6, -7.8],
  [6.2, -7.3],
  [10.8, 1.8],
  [10.8, 3.5],
  [12.3, -4.8],
  [15.1, 5.9],
  [15.1, 7.5],
  [-14.6, -6.9],
  [1.7, -10.7],
];

const STACKED_CRATES = [
  [-11.4, 4.2],
  [6.2, -7.3],
  [10.8, 1.8],
  [15.1, 5.9],
];

function makeCanvasTexture(painter) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  painter(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function makeGroundTexture() {
  return makeCanvasTexture((context, width, height) => {
    context.fillStyle = PALETTE.floor;
    context.fillRect(0, 0, width, height);

    for (let index = 0; index < 180; index += 1) {
      const dotX = Math.random() * width;
      const dotY = Math.random() * height;
      const dotSize = 1 + Math.random() * 4;
      context.fillStyle = Math.random() > 0.5 ? PALETTE.floorDark : PALETTE.concrete;
      context.globalAlpha = 0.12 + Math.random() * 0.12;
      context.fillRect(dotX, dotY, dotSize, dotSize);
    }
    context.globalAlpha = 1;

    context.strokeStyle = PALETTE.concreteDark;
    context.globalAlpha = 0.22;
    context.lineWidth = 7;
    for (let x = 0; x <= width; x += 128) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 128) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.globalAlpha = 1;
  });
}

function makePlatformTexture() {
  return makeCanvasTexture((context, width, height) => {
    context.fillStyle = PALETTE.concrete;
    context.fillRect(0, 0, width, height);
    context.fillStyle = PALETTE.concreteDark;
    context.fillRect(0, height - 48, width, 48);
    context.fillStyle = PALETTE.accent;
    for (let index = 0; index < width; index += 48) {
      context.fillRect(index + 10, height - 40, 18, 8);
    }
    context.strokeStyle = PALETTE.hairline;
    context.lineWidth = 10;
    context.strokeRect(8, 8, width - 16, height - 16);
  });
}

function makeSiteTexture() {
  return makeCanvasTexture((context, width, height) => {
    context.clearRect(0, 0, width, height);
    context.strokeStyle = PALETTE.accent;
    context.lineWidth = 16;
    context.strokeRect(26, 26, width - 52, height - 52);
    context.globalAlpha = 0.2;
    context.fillStyle = PALETTE.accent;
    context.fillRect(26, 26, width - 52, height - 52);
    context.globalAlpha = 1;
    context.fillStyle = PALETTE.accent;
    context.font = 'bold 132px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('A', width / 2, height / 2);
  });
}

function createBox({
  width,
  height,
  depth,
  x,
  y,
  z,
  color,
  roughness = 0.82,
  metalness = 0.04,
  map = null,
}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness, map }),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addCollider(colliders, mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  colliders.push(box);
}

export function createWorld(scene) {
  const colliders = [];
  const shootables = [];

  scene.fog = new THREE.Fog(PALETTE.sky, 27, 82);

  const hemisphere = new THREE.HemisphereLight(PALETTE.sky, PALETTE.floorDark, 1.45);
  hemisphere.position.set(0, 16, 0);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(PALETTE.ink, 2.35);
  sun.position.set(17, 22, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  const groundTexture = makeGroundTexture();
  groundTexture.repeat.set(10, 6);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_WIDTH, GROUND_DEPTH),
    new THREE.MeshStandardMaterial({
      color: PALETTE.canvas,
      map: groundTexture,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = true;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  const platformTexture = makePlatformTexture();
  platformTexture.repeat.set(3, 2);
  const platform = createBox({
    width: PLATFORM_WIDTH,
    height: PLATFORM_HEIGHT,
    depth: PLATFORM_DEPTH,
    x: 2,
    y: PLATFORM_HEIGHT / 2,
    z: 0,
    color: PALETTE.concrete,
    map: platformTexture,
  });
  scene.add(platform);
  shootables.push(platform);
  addCollider(colliders, platform);

  const wallMaterials = new THREE.MeshStandardMaterial({
    color: PALETTE.concreteDark,
    roughness: 0.88,
    metalness: 0.06,
  });
  const wallDefinitions = [
    [0, WALL_HEIGHT / 2, -GROUND_DEPTH / 2, GROUND_WIDTH + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS],
    [0, WALL_HEIGHT / 2, GROUND_DEPTH / 2, GROUND_WIDTH + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS],
    [-GROUND_WIDTH / 2, WALL_HEIGHT / 2, 0, WALL_THICKNESS, WALL_HEIGHT, GROUND_DEPTH],
    [GROUND_WIDTH / 2, WALL_HEIGHT / 2, 0, WALL_THICKNESS, WALL_HEIGHT, GROUND_DEPTH],
  ];
  for (const [x, y, z, width, height, depth] of wallDefinitions) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMaterials);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    shootables.push(wall);
    addCollider(colliders, wall);
  }

  const crateMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.olive,
    roughness: 0.75,
    metalness: 0.03,
  });
  const crateTrimMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.oliveLight,
    roughness: 0.7,
    metalness: 0.02,
  });
  CRATES.forEach(([x, z], index) => {
    const crate = createBox({
      width: 1.7,
      height: 1.35,
      depth: 1.7,
      x,
      y: 0.675,
      z,
      color: index % 2 ? PALETTE.olive : PALETTE.khaki,
    });
    crate.rotation.y = (index % 3) * 0.08 - 0.08;
    scene.add(crate);
    shootables.push(crate);
    addCollider(colliders, crate);

    const trim = createBox({
      width: 1.75,
      height: 0.14,
      depth: 1.75,
      x,
      y: 1.32,
      z,
      color: PALETTE.oliveLight,
    });
    trim.rotation.y = crate.rotation.y;
    scene.add(trim);
    shootables.push(trim);
  });

  STACKED_CRATES.forEach(([x, z], index) => {
    const upperCrate = createBox({
      width: 1.5,
      height: 1.3,
      depth: 1.5,
      x,
      y: 2.02,
      z,
      color: index % 2 ? PALETTE.concreteDark : PALETTE.surface,
    });
    upperCrate.rotation.y = index * 0.12;
    scene.add(upperCrate);
    shootables.push(upperCrate);
    addCollider(colliders, upperCrate);
  });

  for (let rampIndex = 0; rampIndex < RAMP_STEP_COUNT; rampIndex += 1) {
    const stepTop = RAMP_STEP_HEIGHT * (rampIndex + 1);
    const westX = -4.8 - (RAMP_STEP_COUNT - rampIndex - 1) * RAMP_STEP_DEPTH;
    const eastX = 8.8 + (RAMP_STEP_COUNT - rampIndex - 1) * RAMP_STEP_DEPTH;
    for (const x of [westX, eastX]) {
      const step = createBox({
        width: RAMP_STEP_DEPTH + 0.08,
        height: stepTop,
        depth: RAMP_WIDTH,
        x,
        y: stepTop / 2,
        z: 0,
        color: rampIndex % 2 ? PALETTE.concrete : PALETTE.concreteDark,
      });
      scene.add(step);
      shootables.push(step);
      addCollider(colliders, step);
    }
  }

  const siteTexture = makeSiteTexture();
  const siteZone = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 7.4),
    new THREE.MeshBasicMaterial({
      color: PALETTE.canvas,
      map: siteTexture,
      transparent: true,
      opacity: 0.94,
    }),
  );
  siteZone.rotation.x = -Math.PI / 2;
  siteZone.position.set(-7.6, 0.025, -6.2);
  siteZone.castShadow = true;
  siteZone.receiveShadow = true;
  scene.add(siteZone);
  shootables.push(siteZone);

  const sitePostMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.accent,
    roughness: 0.55,
    metalness: 0.1,
  });
  for (const [x, z] of [[-11.5, -9.7], [-3.7, -9.7], [-3.7, -2.7], [-11.5, -2.7]]) {
    const post = createBox({
      width: 0.18,
      height: 1.15,
      depth: 0.18,
      x,
      y: 0.575,
      z,
      color: PALETTE.accent,
      roughness: 0.55,
    });
    scene.add(post);
    shootables.push(post);
    addCollider(colliders, post);
    void sitePostMaterial;
  }

  return { colliders, shootables, cover: CRATES };
}
