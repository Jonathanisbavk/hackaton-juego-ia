'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════
type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  hue: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ObstacleKind = 'BACHE' | 'COMBI';

interface Obstacle extends Rect {
  kind: ObstacleKind;
  speed: number;
  hit: boolean; // already collided this pass
}

interface Collectible extends Rect {
  speed: number;
  collected: boolean;
}

interface Player extends Rect {
  speed: number;
}

interface GameResults {
  soles: number;
  estrellas: number;
  survived: number;
  obstaclesDodged: number;
  pasajerosRecogidos: number;
  won: boolean;
}

interface HudData {
  soles: number;
  estrellas: number;
  temblor: boolean;
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const TICO_WIDTH = 48;
const TICO_HEIGHT = 72;
const TICO_SPEED = 340;

const BACHE_SIZE = 50;
const COMBI_WIDTH = 42;
const COMBI_HEIGHT = 72;

const PASAJERO_SIZE = 36;

const OBSTACLE_BASE_SPEED = 190;
const PASAJERO_BASE_SPEED = 140;

const SPAWN_INTERVAL_START = 1.0;
const SPAWN_INTERVAL_MIN = 0.25;
const DIFFICULTY_RAMP = 0.01;

const PASAJERO_SPAWN_START = 1.7;
const PASAJERO_SPAWN_MIN = 0.85;
const PASAJERO_RAMP = 0.005;

const MAX_ESTRELLAS = 5;
const SOLES_GOAL = 100;
const INVINCIBILITY_DURATION = 1.2; // seconds of invincibility after hit

const TEMBLOR_THRESHOLD = 70; // soles needed to trigger temblor
const TEMBLOR_SPEED_MULT = 1.8; // obstacle speed multiplier during temblor
const TEMBLOR_SHAKE_INTENSITY = 6; // max pixel offset for screen shake
const TRACK_HORIZON_RATIO = 0.2;
const TRACK_TOP_WIDTH_RATIO = 0.24;
const TRACK_BOTTOM_WIDTH_RATIO = 0.7;

// ═══════════════════════════════════════════
// COLLISION (AABB)
// ═══════════════════════════════════════════
function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

// ═══════════════════════════════════════════
// IMAGE LOADER
// ═══════════════════════════════════════════
function useSprites() {
  const sprites = useRef<Record<string, HTMLImageElement>>({});
  const loaded = useRef(false);

  useEffect(() => {
    const names = ['tico', 'sol', 'combi', 'bache', 'pasajero'];
    let count = 0;
    for (const name of names) {
      const img = new Image();
      img.src = `/sprites/${name}.png`;
      img.onload = () => {
        count++;
        if (count === names.length) loaded.current = true;
      };
      sprites.current[name] = img;
    }
  }, []);

  return sprites;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDepthScale(y: number, logicalH: number) {
  return 0.7 + (clamp(y / Math.max(1, logicalH), 0, 1) * 0.75);
}

// ═══════════════════════════════════════════
// PARTICLE SYSTEM (Start Screen)
// ═══════════════════════════════════════════
function useParticleSystem(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean,
) {
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const initParticles = () => {
      const count = Math.min(
        80,
        Math.floor((window.innerWidth * window.innerHeight) / 15000),
      );
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.3 - 0.1,
        radius: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.1,
        hue: Math.random() > 0.7 ? 270 : 185 + Math.random() * 10,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.opacity})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `hsla(185, 70%, 60%, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    resize();
    initParticles();
    window.addEventListener('resize', resize);
    frameRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [canvasRef, active]);
}

// ═══════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════
function useGameLoop(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  sprites: React.RefObject<Record<string, HTMLImageElement>>,
  active: boolean,
  onHudUpdate: (data: HudData) => void,
  onGameOver: (results: GameResults) => void,
) {
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const obstSpawnRef = useRef(0);
  const pasSpawnRef = useRef(0);

  const playerRef = useRef<Player>({ x: 0, y: 0, w: TICO_WIDTH, h: TICO_HEIGHT, speed: TICO_SPEED });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]);
  const keysRef = useRef<Set<string>>(new Set());

  const solesRef = useRef(0);
  const estrellasRef = useRef(MAX_ESTRELLAS);
  const dodgedRef = useRef(0);
  const pasajerosRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const gameOverFiredRef = useRef(false);
  const lastHudRef = useRef('');

  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;
  const onHudUpdateRef = useRef(onHudUpdate);
  onHudUpdateRef.current = onHudUpdate;

  useEffect(() => {
    if (!active) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      elapsedRef.current = 0;
      obstSpawnRef.current = 0;
      pasSpawnRef.current = 0;
      obstaclesRef.current = [];
      collectiblesRef.current = [];
      solesRef.current = 0;
      estrellasRef.current = MAX_ESTRELLAS;
      dodgedRef.current = 0;
      pasajerosRef.current = 0;
      invincibleUntilRef.current = 0;
      gameOverFiredRef.current = false;
      lastHudRef.current = '';
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let logicalW = 0;
    let logicalH = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      logicalW = rect.width;
      logicalH = rect.height;
      canvas.width = Math.floor(logicalW * dpr);
      canvas.height = Math.floor(logicalH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    // Init player
    const p = playerRef.current;
    p.w = TICO_WIDTH;
    p.h = TICO_HEIGHT;
    p.x = logicalW / 2 - p.w / 2;
    p.y = logicalH - p.h - 32;

    // Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', resize);

    // Initial HUD push
    onHudUpdateRef.current({ soles: 0, estrellas: MAX_ESTRELLAS, temblor: false });

    // Spawn helpers
    const spawnObstacle = () => {
      const isBache = Math.random() < 0.55;
      const kind: ObstacleKind = isBache ? 'BACHE' : 'COMBI';
      const w = isBache ? BACHE_SIZE : COMBI_WIDTH;
      const h = isBache ? BACHE_SIZE : COMBI_HEIGHT;
      const speedMult = 1 + elapsedRef.current * 0.018;
      obstaclesRef.current.push({
        kind,
        x: Math.random() * (logicalW - w),
        y: -h,
        w,
        h,
        speed: (OBSTACLE_BASE_SPEED + Math.random() * 80) * speedMult,
        hit: false,
      });
    };

    const spawnPasajero = () => {
      collectiblesRef.current.push({
        x: Math.random() * (logicalW - PASAJERO_SIZE),
        y: -PASAJERO_SIZE,
        w: PASAJERO_SIZE,
        h: PASAJERO_SIZE,
        speed: PASAJERO_BASE_SPEED + Math.random() * 40,
        collected: false,
      });
    };

    // Broadcast HUD only when changed
    const pushHud = () => {
      const isTemblor = solesRef.current >= TEMBLOR_THRESHOLD;
      const key = `${solesRef.current}:${estrellasRef.current}:${isTemblor}`;
      if (key !== lastHudRef.current) {
        lastHudRef.current = key;
        onHudUpdateRef.current({ soles: solesRef.current, estrellas: estrellasRef.current, temblor: isTemblor });
      }
    };

    // ── RENDER LOOP ─────────────────────
    lastTimeRef.current = 0;
    gameOverFiredRef.current = false;

    const render = (timestamp: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;
      elapsedRef.current += dt;
      const elapsed = elapsedRef.current;

      const player = playerRef.current;
      const obstacles = obstaclesRef.current;
      const collectibles = collectiblesRef.current;
      const keys = keysRef.current;
      const sp = sprites.current;

      // ── Update player ────────────────
      if (keys.has('ArrowLeft') || keys.has('a')) player.x -= player.speed * dt;
      if (keys.has('ArrowRight') || keys.has('d')) player.x += player.speed * dt;
      player.x = Math.max(0, Math.min(logicalW - player.w, player.x));
      player.y = logicalH - player.h - 32;

      const isInvincible = elapsed < invincibleUntilRef.current;
      const isTemblor = solesRef.current >= TEMBLOR_THRESHOLD;

      // ── Spawn obstacles ──────────────
      obstSpawnRef.current += dt;
      const obstInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_START - elapsed * DIFFICULTY_RAMP);
      if (obstSpawnRef.current >= obstInterval) {
        obstSpawnRef.current = 0;
        spawnObstacle();
      }

      // ── Spawn pasajeros ──────────────
      pasSpawnRef.current += dt;
      const pasInterval = Math.max(PASAJERO_SPAWN_MIN, PASAJERO_SPAWN_START - elapsed * PASAJERO_RAMP);
      if (pasSpawnRef.current >= pasInterval) {
        pasSpawnRef.current = 0;
        spawnPasajero();
      }

      // ── Update obstacles ─────────────
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        const speedMod = isTemblor ? TEMBLOR_SPEED_MULT : 1;
        o.y += o.speed * speedMod * dt;

        if (o.y > logicalH + 10) {
          obstacles.splice(i, 1);
          dodgedRef.current++;
          continue;
        }

        // Collision
        if (!o.hit && !isInvincible && rectsOverlap(player, o)) {
          o.hit = true;
          estrellasRef.current = Math.max(0, estrellasRef.current - 1);
          invincibleUntilRef.current = elapsed + INVINCIBILITY_DURATION;
          pushHud();

          if (estrellasRef.current <= 0 && !gameOverFiredRef.current) {
            gameOverFiredRef.current = true;
            onGameOverRef.current({
              soles: solesRef.current,
              estrellas: 0,
              survived: Math.round(elapsed * 10) / 10,
              obstaclesDodged: dodgedRef.current,
              pasajerosRecogidos: pasajerosRef.current,
              won: false,
            });
            return;
          }
        }
      }

      // ── Update collectibles ──────────
      for (let i = collectibles.length - 1; i >= 0; i--) {
        const c = collectibles[i];
        c.y += c.speed * dt;

        if (c.y > logicalH + 10) {
          collectibles.splice(i, 1);
          continue;
        }

        if (!c.collected && rectsOverlap(player, c)) {
          c.collected = true;
          solesRef.current += 10;
          pasajerosRef.current++;
          collectibles.splice(i, 1);
          pushHud();

          // ── Victory condition ──────────
          if (solesRef.current >= SOLES_GOAL && !gameOverFiredRef.current) {
            gameOverFiredRef.current = true;
            onGameOverRef.current({
              soles: solesRef.current,
              estrellas: estrellasRef.current,
              survived: Math.round(elapsed * 10) / 10,
              obstaclesDodged: dodgedRef.current,
              pasajerosRecogidos: pasajerosRef.current,
              won: true,
            });
            return;
          }
        }
      }

      // ══════════════════════════════════
      // DRAW
      // ══════════════════════════════════
      ctx.clearRect(0, 0, logicalW, logicalH);

      // ── Temblor screen shake ─────────
      if (isTemblor) {
        const shakeX = (Math.random() - 0.5) * TEMBLOR_SHAKE_INTENSITY * 2;
        const shakeY = (Math.random() - 0.5) * TEMBLOR_SHAKE_INTENSITY * 2;
        ctx.save();
        ctx.translate(shakeX, shakeY);
      }

      // ── Road surface ─────────────────
      const roadGrd = ctx.createLinearGradient(0, 0, logicalW, 0);
      if (isTemblor) {
        // Red-tinted seismic road
        roadGrd.addColorStop(0, '#180a0a');
        roadGrd.addColorStop(0.15, '#1a0d0d');
        roadGrd.addColorStop(0.5, '#221111');
        roadGrd.addColorStop(0.85, '#1a0d0d');
        roadGrd.addColorStop(1, '#180a0a');
      } else {
        roadGrd.addColorStop(0, '#0a0f18');
        roadGrd.addColorStop(0.15, '#0d1520');
        roadGrd.addColorStop(0.5, '#111b2a');
        roadGrd.addColorStop(0.85, '#0d1520');
        roadGrd.addColorStop(1, '#0a0f18');
      }
      ctx.fillStyle = roadGrd;
      ctx.fillRect(-10, -10, logicalW + 20, logicalH + 20);

      // ── Scrolling grid ───────────────
      ctx.save();
      ctx.strokeStyle = isTemblor ? 'rgba(239, 68, 68, 0.04)' : 'rgba(103, 232, 249, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      const offsetY = (elapsed * 22) % gridSize;
      for (let x = 0; x <= logicalW; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, logicalH);
        ctx.stroke();
      }
      for (let y = -gridSize + offsetY; y <= logicalH; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(logicalW, y);
        ctx.stroke();
      }
      ctx.restore();

      // ── Road lane markers ────────────
      ctx.save();
      const laneMarkerH = 30;
      const laneGap = 50;
      const laneOffset = (elapsed * 110) % (laneMarkerH + laneGap);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
      ctx.lineWidth = 2;
      ctx.setLineDash([laneMarkerH, laneGap]);
      ctx.lineDashOffset = -laneOffset;
      const laneCount = 5;
      for (let i = 1; i < laneCount; i++) {
        const lx = (logicalW / laneCount) * i;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, logicalH);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // ── Road edge lines ──────────────
      ctx.save();
      ctx.strokeStyle = isTemblor ? 'rgba(239, 68, 68, 0.25)' : 'rgba(251, 191, 36, 0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(2, logicalH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(logicalW - 2, 0);
      ctx.lineTo(logicalW - 2, logicalH);
      ctx.stroke();
      ctx.restore();

      const horizonY = logicalH * TRACK_HORIZON_RATIO;
      const roadTopWidth = logicalW * TRACK_TOP_WIDTH_RATIO;
      const roadBottomWidth = logicalW * TRACK_BOTTOM_WIDTH_RATIO;
      const roadTopLeft = logicalW / 2 - roadTopWidth / 2;
      const roadTopRight = logicalW / 2 + roadTopWidth / 2;
      const roadBottomLeft = logicalW / 2 - roadBottomWidth / 2;
      const roadBottomRight = logicalW / 2 + roadBottomWidth / 2;
      const lavaGlow = isTemblor ? 0.45 : 0.22;

      // ── Atmospheric background ──────
      const sky = ctx.createLinearGradient(0, 0, 0, logicalH);
      sky.addColorStop(0, isTemblor ? '#120606' : '#07111f');
      sky.addColorStop(0.35, isTemblor ? '#1b0a09' : '#10253e');
      sky.addColorStop(1, isTemblor ? '#2a0e0c' : '#07111f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, logicalW, logicalH);

      // Distant smoke and stars
      ctx.save();
      for (let i = 0; i < 24; i++) {
        const starX = (i * 173 + (elapsed * 12)) % logicalW;
        const starY = horizonY * 0.28 + (i % 5) * 8;
        ctx.fillStyle = i % 4 === 0 ? 'rgba(251, 191, 36, 0.75)' : 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.arc(starX, starY, i % 4 === 0 ? 1.8 : 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Volcano silhouettes
      const volcanoBaseY = horizonY + 28;
      const volcanoPeakX = logicalW * 0.68;
      const volcanoWidth = logicalW * 0.26;
      ctx.save();
      const volcanoGrd = ctx.createLinearGradient(0, volcanoBaseY - 120, 0, volcanoBaseY + 12);
      volcanoGrd.addColorStop(0, 'rgba(35, 16, 16, 0.2)');
      volcanoGrd.addColorStop(1, isTemblor ? '#1e0908' : '#101827');
      ctx.fillStyle = volcanoGrd;
      ctx.beginPath();
      ctx.moveTo(volcanoPeakX - volcanoWidth * 0.55, volcanoBaseY + 8);
      ctx.lineTo(volcanoPeakX - volcanoWidth * 0.12, volcanoBaseY - 124);
      ctx.lineTo(volcanoPeakX + volcanoWidth * 0.25, volcanoBaseY + 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = isTemblor ? 'rgba(251, 146, 60, 0.15)' : 'rgba(56, 189, 248, 0.06)';
      ctx.beginPath();
      ctx.ellipse(volcanoPeakX, volcanoBaseY - 110, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(251, 115, 22, ${isTemblor ? 0.55 : 0.22})`;
      ctx.beginPath();
      ctx.ellipse(volcanoPeakX, volcanoBaseY - 122, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(251, 191, 36, ${lavaGlow})`;
      ctx.beginPath();
      ctx.ellipse(volcanoPeakX - 4, volcanoBaseY - 120, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Side lava fields
      ctx.save();
      const lavaLeft = ctx.createLinearGradient(0, 0, roadBottomLeft, 0);
      lavaLeft.addColorStop(0, isTemblor ? '#ff7a18' : '#ff6b00');
      lavaLeft.addColorStop(0.7, isTemblor ? '#7f1d1d' : '#5b1a08');
      lavaLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = lavaLeft;
      ctx.beginPath();
      ctx.moveTo(0, logicalH);
      ctx.lineTo(0, horizonY - 10);
      ctx.lineTo(roadTopLeft - 12, horizonY + 20);
      ctx.lineTo(roadBottomLeft - 38, logicalH);
      ctx.closePath();
      ctx.fill();

      const lavaRight = ctx.createLinearGradient(logicalW, 0, roadBottomRight, 0);
      lavaRight.addColorStop(0, isTemblor ? '#ff7a18' : '#ff6b00');
      lavaRight.addColorStop(0.7, isTemblor ? '#7f1d1d' : '#5b1a08');
      lavaRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = lavaRight;
      ctx.beginPath();
      ctx.moveTo(logicalW, logicalH);
      ctx.lineTo(logicalW, horizonY - 10);
      ctx.lineTo(roadTopRight + 12, horizonY + 20);
      ctx.lineTo(roadBottomRight + 38, logicalH);
      ctx.closePath();
      ctx.fill();

      // Lava cracks / embers
      ctx.save();
      ctx.strokeStyle = isTemblor ? 'rgba(255, 138, 61, 0.55)' : 'rgba(255, 174, 84, 0.3)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const crackY = horizonY + 35 + i * 58;
        const wobble = Math.sin(elapsed * 1.8 + i) * 12;
        ctx.beginPath();
        ctx.moveTo(roadBottomLeft - 20, crackY);
        ctx.quadraticCurveTo(logicalW / 2 - 150 + wobble, crackY - 10, logicalW / 2 - 35, crackY + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(roadBottomRight + 20, crackY + 6);
        ctx.quadraticCurveTo(logicalW / 2 + 150 - wobble, crackY - 8, logicalW / 2 + 35, crackY + 10);
        ctx.stroke();
      }
      ctx.restore();

      // ── Track surface with perspective ─
      ctx.save();
      const asphalt = ctx.createLinearGradient(roadTopLeft, 0, roadBottomRight, logicalH);
      asphalt.addColorStop(0, isTemblor ? '#1b1111' : '#141d2f');
      asphalt.addColorStop(0.5, isTemblor ? '#261515' : '#0f1726');
      asphalt.addColorStop(1, isTemblor ? '#120807' : '#0a0f18');
      ctx.fillStyle = asphalt;
      ctx.beginPath();
      ctx.moveTo(roadTopLeft, horizonY + 24);
      ctx.lineTo(roadTopRight, horizonY + 24);
      ctx.lineTo(roadBottomRight, logicalH);
      ctx.lineTo(roadBottomLeft, logicalH);
      ctx.closePath();
      ctx.fill();

      // Track borders
      ctx.strokeStyle = isTemblor ? 'rgba(255, 123, 72, 0.9)' : 'rgba(167, 243, 208, 0.45)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(roadTopLeft, horizonY + 24);
      ctx.lineTo(roadBottomLeft, logicalH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(roadTopRight, horizonY + 24);
      ctx.lineTo(roadBottomRight, logicalH);
      ctx.stroke();

      // Center lane markers
      ctx.save();
      ctx.strokeStyle = isTemblor ? 'rgba(255, 210, 120, 0.65)' : 'rgba(226, 232, 240, 0.45)';
      ctx.lineWidth = 2.5;
      const laneSegments = 14;
      for (let i = 0; i < laneSegments; i++) {
        const t = i / laneSegments;
        const y0 = horizonY + 26 + t * (logicalH - horizonY - 26);
        const y1 = y0 + 24 + t * 26;
        const widthAtY0 = roadTopWidth + (roadBottomWidth - roadTopWidth) * t;
        const widthAtY1 = roadTopWidth + (roadBottomWidth - roadTopWidth) * Math.min(1, t + 0.02);
        const x0 = logicalW / 2 - widthAtY0 * 0.5;
        const x1 = logicalW / 2 - widthAtY1 * 0.5;
        const dashOffset = (elapsed * 240 + i * 36) % 60;
        ctx.setLineDash([18, 18]);
        ctx.lineDashOffset = -dashOffset;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Road texture and depth haze
      ctx.save();
      ctx.fillStyle = isTemblor ? 'rgba(255, 122, 24, 0.06)' : 'rgba(103, 232, 249, 0.03)';
      for (let i = 0; i < 10; i++) {
        const bandY = horizonY + 30 + ((elapsed * 140 + i * 72) % (logicalH - horizonY - 30));
        const bandW = roadTopWidth + (roadBottomWidth - roadTopWidth) * ((bandY - horizonY) / Math.max(1, logicalH - horizonY));
        ctx.fillRect(logicalW / 2 - bandW / 2, bandY, bandW, 3);
      }
      ctx.restore();

      // ── Draw collectibles (pasajeros) ─
      for (const c of collectibles) {
        if (c.collected) continue;
        const scale = getDepthScale(c.y, logicalH);
        const dw = c.w * scale;
        const dh = c.h * scale;
        const dx = c.x + c.w / 2 - dw / 2;
        const dy = c.y + c.h / 2 - dh / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(251, 191, 36, 0.75)';
        ctx.shadowBlur = 20;
        if (sp['pasajero'] && sp['pasajero'].complete) {
          ctx.drawImage(sp['pasajero'], dx, dy, dw, dh);
        } else {
          // Fallback circle
          const passengerGrd = ctx.createRadialGradient(dx + dw * 0.5, dy + dh * 0.45, 2, dx + dw * 0.5, dy + dh * 0.45, dw * 0.6);
          passengerGrd.addColorStop(0, '#fff7c2');
          passengerGrd.addColorStop(0.45, '#fbbf24');
          passengerGrd.addColorStop(1, '#f97316');
          ctx.fillStyle = passengerGrd;
          ctx.beginPath();
          ctx.ellipse(dx + dw / 2, dy + dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Sol coin indicator floating above
        ctx.shadowBlur = 0;
        const coinSize = 16 * scale;
        const bobY = Math.sin(elapsed * 4 + c.x) * 3 * scale;
        if (sp['sol'] && sp['sol'].complete) {
          ctx.drawImage(sp['sol'], dx + dw / 2 - coinSize / 2, dy - coinSize - 4 + bobY, coinSize, coinSize);
        }
        // "+10" label
        ctx.font = `${Math.max(9, 9 * scale)}px "Space Grotesk", system-ui`;
        ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.textAlign = 'center';
        ctx.fillText('+10', dx + dw / 2, dy - 2 + bobY);
        ctx.restore();
      }

      // ── Draw obstacles ───────────────
      for (const o of obstacles) {
        const scale = getDepthScale(o.y, logicalH);
        const dw = o.w * scale;
        const dh = o.h * scale;
        const dx = o.x + o.w / 2 - dw / 2;
        const dy = o.y + o.h / 2 - dh / 2;
        ctx.save();
        ctx.shadowColor = isTemblor ? 'rgba(255, 122, 24, 0.55)' : 'rgba(15, 23, 42, 0.45)';
        ctx.shadowBlur = 12 * scale;
        ctx.shadowOffsetY = 6;
        if (o.kind === 'BACHE') {
          ctx.fillStyle = isTemblor ? '#2a0908' : '#1f2937';
          ctx.beginPath();
          ctx.ellipse(dx + dw / 2, dy + dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = isTemblor ? '#fb923c' : '#94a3b8';
          ctx.lineWidth = Math.max(1.5, 2 * scale);
          ctx.stroke();
          ctx.fillStyle = isTemblor ? 'rgba(251, 146, 60, 0.25)' : 'rgba(148, 163, 184, 0.2)';
          ctx.beginPath();
          ctx.ellipse(dx + dw / 2, dy + dh / 2, dw * 0.22, dh * 0.14, -0.4, 0, Math.PI * 2);
          ctx.fill();
          if (sp['bache'] && sp['bache'].complete) {
            ctx.globalAlpha = 0.7;
            ctx.drawImage(sp['bache'], dx, dy, dw, dh);
            ctx.globalAlpha = 1;
          } else {
            const pothole = ctx.createRadialGradient(dx + dw / 2, dy + dh / 2, 3, dx + dw / 2, dy + dh / 2, dw / 2);
            pothole.addColorStop(0, '#09090b');
            pothole.addColorStop(0.65, '#1f2937');
            pothole.addColorStop(1, '#5b1a08');
            ctx.fillStyle = pothole;
            ctx.beginPath();
            ctx.ellipse(dx + dw / 2, dy + dh / 2, dw / 2, dh / 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.ellipse(dx + dw * 0.34, dy + dh * 0.33, dw * 0.12, dh * 0.08, -0.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const carBody = ctx.createLinearGradient(dx, dy, dx, dy + dh);
          carBody.addColorStop(0, isTemblor ? '#fed7aa' : '#f8fafc');
          carBody.addColorStop(0.55, isTemblor ? '#f97316' : '#dbeafe');
          carBody.addColorStop(1, isTemblor ? '#7c2d12' : '#94a3b8');
          ctx.fillStyle = carBody;
          ctx.beginPath();
          ctx.roundRect(dx, dy + dh * 0.12, dw, dh * 0.72, Math.max(4, 6 * scale));
          ctx.fill();
          ctx.fillStyle = isTemblor ? '#ea580c' : '#2563eb';
          ctx.beginPath();
          ctx.roundRect(dx + dw * 0.12, dy, dw * 0.76, dh * 0.42, Math.max(3, 5 * scale));
          ctx.fill();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.beginPath();
          ctx.roundRect(dx + dw * 0.17, dy + dh * 0.06, dw * 0.25, dh * 0.16, 3);
          ctx.roundRect(dx + dw * 0.58, dy + dh * 0.06, dw * 0.22, dh * 0.16, 3);
          ctx.fill();
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.arc(dx + dw * 0.18, dy + dh * 0.84, Math.max(2.5, 4 * scale), 0, Math.PI * 2);
          ctx.arc(dx + dw * 0.82, dy + dh * 0.84, Math.max(2.5, 4 * scale), 0, Math.PI * 2);
          ctx.fill();
          if (sp['combi'] && sp['combi'].complete) {
            ctx.globalAlpha = 0.85;
            ctx.drawImage(sp['combi'], dx, dy, dw, dh);
            ctx.globalAlpha = 1;
          } else {
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.4)';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx, dy + dh * 0.12, dw, dh * 0.72);
          }
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(dx + 1, dy + dh * 0.12 + 1, dw - 2, dh * 0.72 - 2);
        }
        ctx.restore();
      }

      // ── Draw Tico (player) ───────────
      ctx.save();
      const blinkVisible = isInvincible ? Math.floor(elapsed * 10) % 2 === 0 : true;

      if (blinkVisible) {
        const scale = getDepthScale(player.y, logicalH);
        const pw = player.w * scale;
        const ph = player.h * scale;
        const px = player.x + player.w / 2 - pw / 2;
        const py = player.y + player.h / 2 - ph / 2;
        // Glow beneath
        ctx.shadowColor = isTemblor ? 'rgba(251, 146, 60, 0.65)' : 'rgba(251, 191, 36, 0.55)';
        ctx.shadowBlur = 22 * scale;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(player.x + player.w / 2, player.y + player.h * 0.9, pw * 0.45, ph * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();

        if (sp['tico'] && sp['tico'].complete) {
          ctx.drawImage(sp['tico'], px, py, pw, ph);
        } else {
          // Fallback vehicle body with depth
          const grd = ctx.createLinearGradient(px, py, px, py + ph);
          grd.addColorStop(0, isTemblor ? '#fde68a' : '#fbbf24');
          grd.addColorStop(0.5, isTemblor ? '#fb923c' : '#f59e0b');
          grd.addColorStop(1, isTemblor ? '#c2410c' : '#b45309');
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.roundRect(px, py + ph * 0.12, pw, ph * 0.76, 10);
          ctx.fill();
          ctx.fillStyle = 'rgba(17, 24, 39, 0.88)';
          ctx.beginPath();
          ctx.roundRect(px + pw * 0.16, py + ph * 0.08, pw * 0.68, ph * 0.24, 7);
          ctx.fill();
        }
      }
      ctx.restore();

      // Lava haze and embers overlay
      ctx.save();
      const emberCount = isTemblor ? 28 : 12;
      for (let i = 0; i < emberCount; i++) {
        const x = (Math.sin(elapsed * 0.8 + i * 9.1) * 0.5 + 0.5) * logicalW;
        const y = horizonY + (i * 37 + elapsed * (isTemblor ? 60 : 24)) % (logicalH - horizonY);
        const size = 1.2 + (i % 3) * 0.7;
        ctx.fillStyle = isTemblor ? 'rgba(251, 146, 60, 0.8)' : 'rgba(251, 191, 36, 0.35)';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ── Temblor vignette overlay ─────
      if (isTemblor) {
        // Pulsating red vignette
        const pulse = 0.06 + Math.sin(elapsed * 6) * 0.03;
        const vGrd = ctx.createRadialGradient(
          logicalW / 2, logicalH / 2, logicalH * 0.2,
          logicalW / 2, logicalH / 2, logicalH * 0.8,
        );
        vGrd.addColorStop(0, 'transparent');
        vGrd.addColorStop(1, `rgba(220, 38, 38, ${pulse})`);
        ctx.fillStyle = vGrd;
        ctx.fillRect(-10, -10, logicalW + 20, logicalH + 20);

        // "SISMO" watermark
        ctx.save();
        ctx.font = '800 60px "Space Grotesk", system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(239, 68, 68, ${0.04 + Math.sin(elapsed * 3) * 0.02})`;
        ctx.fillText('⚠ SISMO ⚠', logicalW / 2, logicalH / 2);
        ctx.restore();

        // End shake transform
        ctx.restore();
      }

      // ── Next frame ───────────────────
      frameRef.current = requestAnimationFrame(render);
    };

    lastTimeRef.current = 0;
    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [canvasRef, sprites, active]);
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════
export function TikoRushGame() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [results, setResults] = useState<GameResults>({
    soles: 0, estrellas: 0, survived: 0, obstaclesDodged: 0, pasajerosRecogidos: 0, won: false,
  });
  const [hud, setHud] = useState<HudData>({ soles: 0, estrellas: MAX_ESTRELLAS, temblor: false });

  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sprites = useSprites();

  // Particle system for START screen
  useParticleSystem(particleCanvasRef, gameState === 'START');

  const handleHudUpdate = useCallback((data: HudData) => setHud(data), []);

  const handleGameOver = useCallback((r: GameResults) => {
    setResults(r);
    setGameState('GAME_OVER');
  }, []);

  // Game loop
  useGameLoop(gameCanvasRef, sprites, gameState === 'PLAYING', handleHudUpdate, handleGameOver);

  const startTurn = useCallback(() => {
    setHud({ soles: 0, estrellas: MAX_ESTRELLAS, temblor: false });
    setGameState('PLAYING');
  }, []);
  const resetGame = useCallback(() => {
    setResults({ soles: 0, estrellas: 0, survived: 0, obstaclesDodged: 0, pasajerosRecogidos: 0, won: false });
    setHud({ soles: 0, estrellas: MAX_ESTRELLAS, temblor: false });
    setGameState('START');
  }, []);

  // ── START Screen ──────────────────────
  if (gameState === 'START') {
    return (
      <div className="start-screen" id="start-screen">
        <canvas ref={particleCanvasRef} className="particles-canvas" />

        <div className="start-content">
          <div className="game-badge">
            <span className="badge-dot" />
            Juego 2D &bull; Arequipa
          </div>

          <h1 className="game-title">
            Tiko
            <span>Rush</span>
          </h1>

          <p className="game-subtitle">
            Esquiva baches y combis en las calles de Arequipa.
            Recoge pasajeros para ganar soles. ¡Sobrevive con tus 5 estrellas!
          </p>

          <button
            type="button"
            className="start-button"
            id="start-button"
            onClick={startTurn}
          >
            <span className="start-button-icon">▶</span>
            Iniciar Turno
          </button>
        </div>

        <div className="start-footer">
          <span>← → Flechas para moverse</span>
          <span>Recoge pasajeros = +10 soles</span>
          <span>5 ⭐ de vida</span>
        </div>
      </div>
    );
  }

  // ── PLAYING Screen ────────────────────
  if (gameState === 'PLAYING') {
    return (
      <div className={`playing-screen ${hud.temblor ? 'playing-temblor' : ''}`} id="playing-screen">
        {/* ── Temblor Alert Banner ──────── */}
        {hud.temblor && (
          <div className="temblor-alert" id="temblor-alert">
            <span className="temblor-alert-icon">⚠</span>
            <span className="temblor-alert-text">MOMENTO SÍSMICO</span>
            <span className="temblor-alert-sub">¡Velocidad +50% — Cuidado!</span>
          </div>
        )}

        {/* ── HTML/CSS HUD Overlay ──────── */}
        <div className={`hud-overlay ${hud.temblor ? 'hud-temblor' : ''}`} id="hud-overlay">
          <div className="hud-section">
            <div className="hud-soles" id="hud-soles">
              <img src="/sprites/sol.png" alt="Sol" className="hud-icon" />
              <div className="hud-soles-info">
                <span className="hud-soles-value">{hud.soles}<span className="hud-soles-goal">/{SOLES_GOAL}</span></span>
                <div className={`soles-bar ${hud.temblor ? 'soles-bar-temblor' : ''}`}>
                  <div
                    className={`soles-bar-fill ${hud.temblor ? 'soles-bar-fill-temblor' : ''}`}
                    style={{ width: `${Math.min(100, (hud.soles / SOLES_GOAL) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="hud-section hud-center-section">
            <span className={`hud-game-title ${hud.temblor ? 'hud-game-title-temblor' : ''}`}>
              {hud.temblor ? '⚠ SISMO ⚠' : 'TIKO RUSH'}
            </span>
            <span className="hud-meta">
              {hud.temblor ? '¡Sobrevive al temblor!' : `Meta: ${SOLES_GOAL} soles`}
            </span>
          </div>

          <div className="hud-section">
            <div className="hud-estrellas" id="hud-estrellas">
              <div className="estrellas-stars">
                {Array.from({ length: MAX_ESTRELLAS }, (_, i) => (
                  <span
                    key={i}
                    className={`estrella ${i < hud.estrellas ? 'estrella-active' : 'estrella-lost'}`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="hud-estrellas-label">Vidas</span>
            </div>
          </div>
        </div>

        <div className="canvas-container">
          <canvas
            ref={gameCanvasRef}
            className="game-canvas"
            id="game-canvas"
          />
        </div>
      </div>
    );
  }

  // ── GAME_OVER Screen ──────────────────
  const isWin = results.won;

  return (
    <div className={`gameover-screen ${isWin ? 'gameover-win' : 'gameover-lose'}`} id="gameover-screen">
      <div className="gameover-content">
        {isWin ? (
          <>
            <p className="gameover-label gameover-label-win">🎓 ¡Victoria!</p>
            <h1 className="gameover-title gameover-title-win">¡Llegaste a la UNSA a tiempo!</h1>
            <p className="gameover-subtitle">
              Recogiste suficientes pasajeros y completaste tu turno exitosamente.
            </p>
          </>
        ) : (
          <>
            <p className="gameover-label">💥 Turno arruinado</p>
            <h1 className="gameover-title">Game Over</h1>
            <p className="gameover-subtitle">
              Tu Tico se quedó sin estrellas en las calles de Arequipa.
            </p>
          </>
        )}

        <div className="gameover-stats">
          <div className="stat-item">
            <img src="/sprites/sol.png" alt="Soles" className="stat-icon" />
            <span className={`stat-value ${isWin ? 'stat-value-win' : ''}`}>{results.soles}</span>
            <span className="stat-label">Soles</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{results.survived}s</span>
            <span className="stat-label">Tiempo</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{results.pasajerosRecogidos}</span>
            <span className="stat-label">Pasajeros</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{results.obstaclesDodged}</span>
            <span className="stat-label">Esquivados</span>
          </div>
          <div className="stat-item">
            <div className="estrellas-stars estrellas-result">
              {Array.from({ length: MAX_ESTRELLAS }, (_, i) => (
                <span
                  key={i}
                  className={`estrella ${i < results.estrellas ? 'estrella-active' : 'estrella-lost'}`}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="stat-label">Estrellas</span>
          </div>
        </div>

        <button
          type="button"
          className={`restart-button ${isWin ? 'restart-button-win' : ''}`}
          id="restart-button"
          onClick={resetGame}
        >
          ↺ Reiniciar turno
        </button>
      </div>
    </div>
  );
}
