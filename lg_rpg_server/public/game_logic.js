// Client-side game logic that renders the map, sprites, and UI using Phaser.
import { GAME_VIEW, GAME_PHASES, SOCKET_EVENTS } from './shared_constants.js';
import { drawPvp, drawHearts, showWaiting, hideWaiting } from './scene/overlays.js';
import { createWeather, updateWeather } from './scene/weather.js';
import { deathBurst, spillShards, healPopup } from './scene/effects.js';

// Parse the screen number parameter to determine this screen's role.
const urlParams = new URLSearchParams(window.location.search);
const screenNumber = parseInt(urlParams.get('screen')) || 1;

function showScreenNotice(message) {
  const container = document.getElementById('game-container');
  if (container) container.innerHTML = `<div class="screen-notice">${message}</div>`;
}

const socket = io();

const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json();
};

// Fetches configuration and assets, then starts the Phaser game instance.
async function startGame() {
  try {
    const configData = await fetchJson('/api/config');
    const mapConfig = configData.map;

    if (!mapConfig?.key || !mapConfig?.path || !mapConfig?.layers?.ground) {
      throw new Error('Game config is missing map key, path, or ground layer.');
    }

    const mapScreens = Math.max(1, configData.totalScreens - 1);
    if (screenNumber < 1 || screenNumber > mapScreens) {
      showScreenNotice(
        screenNumber === configData.totalScreens
          ? 'Leaderboard screen.\nOpen /right_screen.html here.'
          : `Screen ${screenNumber} is out of range.\nGame screens are 1–${mapScreens}.`
      );
      return;
    }

    const playersManifest = await fetchJson('assets/players/players.json');
    const enemiesManifest = configData.selectedMode === 'zombie' ? await fetchJson('assets/enemies/enemies.json').catch(() => null) : null;
    const playerDefinitions = [
      ...Object.values(playersManifest.players || {}),
      ...Object.values(playersManifest.animationSheetPlayers || {}),
    ];

    function resolvePlayerDefinition(key) {
      return playersManifest.players?.[key]
        ?? playersManifest.animationSheetPlayers?.[key]
        ?? playersManifest.players?.[playersManifest.defaultPlayer]
        ?? playersManifest.animationSheetPlayers?.[playersManifest.defaultPlayer];
    }

    function playerAnimationPrefix(def) {
      return def.textureKeyPrefix ?? def.textureKey;
    }

    // Main Phaser game scene managing player, enemy, and heart entities.
    class LgRPG extends Phaser.Scene {
      constructor() {
        super('LgRPG');
        this.serverPlayers = [];
        this.serverEnemies = [];
        this.serverHearts = [];
        this.serverMatch = null;
        this.serverPvp = null;
        this.playerSprites = new Map();
        this.enemySprites = new Map();
        this.projectileSprites = new Map();
        this.serverProjectiles = [];
      }

      // Loads map JSON, tileset images, player spritesheets, and enemy spritesheets.
      preload() {
        this.load.tilemapTiledJSON(mapConfig.key, `assets/${mapConfig.path}`);
        (mapConfig.tilesets || []).forEach(t => this.load.image(t.key, `assets/${t.path}`));
        this.load.spritesheet('heart', 'assets/items/heart.png', { frameWidth: 16, frameHeight: 16 });

        if (configData.selectedMode === 'zombie') {
          this.load.spritesheet('rain', 'assets/fx/Rain.png', { frameWidth: 8, frameHeight: 8 });
          this.load.spritesheet('rain-floor', 'assets/fx/RainOnFloor.png', { frameWidth: 8, frameHeight: 8 });
        }

        playerDefinitions.forEach(p => {
          if (p.assetMode === 'animationSheets') {
            const { width, height } = p.frame;
            Object.entries(p.animations).forEach(([animName, anim]) => {
              this.load.spritesheet(`${p.textureKeyPrefix}:${animName}`, `assets/${anim.path}`, { frameWidth: width, frameHeight: height });
            });
          } else {
            this.load.spritesheet(p.textureKey, `assets/${p.assetPath}`, { frameWidth: p.frame.width, frameHeight: p.frame.height });
          }
        });

        if (enemiesManifest) {
          Object.values(enemiesManifest.enemies).forEach(def => {
            const { width, height } = def.frame;
            Object.entries(def.animations).forEach(([animName, anim]) => {
              this.load.spritesheet(`${def.textureKeyPrefix}:${animName}`, `assets/${anim.path}`, { frameWidth: width, frameHeight: height });
            });
            Object.entries(def.projectiles || {}).forEach(([name, proj]) => {
              this.load.spritesheet(`${def.textureKeyPrefix}:proj:${name}`, `assets/${proj.path}`,
                { frameWidth: proj.frame.width, frameHeight: proj.frame.height });
            });
          });
        }
      }

      // Prepares the map, tile layers, event listeners, and sprite animations.
      create() {
        const map = this.make.tilemap({ key: mapConfig.key, tileWidth: 16, tileHeight: 16 });
        const tilesets = (mapConfig.tilesets || [])
          .map(t => map.addTilesetImage(t.name, t.key, undefined, undefined, undefined, undefined, t.firstgid))
          .filter(Boolean);
        this.cameraOffset = (screenNumber - 1) * GAME_VIEW.screenWidth;
        this.mapLayers = [];
        const layerNames = [...new Set(Object.values(mapConfig.layers || {}).filter(Boolean))];
        layerNames.forEach((layerName, index) => {
          const layer = map.createLayer(layerName, tilesets, -this.cameraOffset, 0);
          if (layer) {
            layer.setDepth(index);
            this.mapLayers.push(layer);
          } else {
            console.warn(`Map layer not found: ${layerName}`);
          }
        });
        // Drawn above the ground but below sprites (sprites use depth = world y).
        this.pvpGraphics = this.add.graphics().setDepth(2);
        if (configData.selectedMode === 'zombie') {
          createWeather(this);
        }
        this.heartSprites = new Map();
        this.anims.create({
          key: 'heart:pulse',
          frames: this.anims.generateFrameNumbers('heart', { start: 0, end: 5 }),
          frameRate: 8, repeat: -1,
        });

        socket.on(SOCKET_EVENTS.GAME_STATE, d => {
          this.serverPlayers = d.players || [];
          this.serverEnemies = d.enemies || [];
          this.serverProjectiles = d.projectiles || [];
          this.serverHearts = d.hearts || [];
          this.serverMatch = d.match || null;
          this.serverPvp = d.pvp || null;
        });

        socket.on(SOCKET_EVENTS.GAME_OVER, () => {
          this.phase = GAME_PHASES.LOBBY;
          showWaiting(this);
        });

        socket.on(SOCKET_EVENTS.GAME_STARTED, d => {
          if (d?.map?.key && d.map.key !== mapConfig.key) return window.location.reload();
          this.phase = GAME_PHASES.PLAYING;
          hideWaiting(this);
        });

        this.phase = configData.phase || GAME_PHASES.LOBBY;
        if (this.phase !== GAME_PHASES.PLAYING) showWaiting(this);

        playerDefinitions.forEach(def => {
          const prefix = playerAnimationPrefix(def);
          Object.entries(def.animations).forEach(([name, anim]) => {
            const textureKey = def.assetMode === 'animationSheets' ? `${prefix}:${name}` : def.textureKey;
            const frameRange = def.assetMode === 'animationSheets'
              ? { start: 0, end: anim.frames - 1 }
              : { start: anim.frames.start, end: anim.frames.end };
            this.anims.create({
              key: `${prefix}:${name}`,
              frames: this.anims.generateFrameNumbers(textureKey, frameRange),
              frameRate: anim.frameRate, repeat: anim.repeat,
            });
          });
        });

        if (enemiesManifest) {
          Object.values(enemiesManifest.enemies).forEach(def => {
            Object.entries(def.animations).forEach(([name, anim]) => {
              const key = `${def.textureKeyPrefix}:${name}`;
              this.anims.create({
                key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: anim.frames - 1 }),
                frameRate: anim.frameRate, repeat: anim.repeat,
              });
            });
            // Split each projectile sheet at spinFrames into a looping "spin" (in flight) and a one-shot "boom" (explosion).
            Object.entries(def.projectiles || {}).forEach(([name, proj]) => {
              const key = `${def.textureKeyPrefix}:proj:${name}`;
              const spin = proj.spinFrames ?? proj.frames;
              this.anims.create({
                key: `${key}:spin`,
                frames: this.anims.generateFrameNumbers(key, { start: 0, end: spin - 1 }),
                frameRate: proj.spinFrameRate ?? 12, repeat: -1,
              });
              this.anims.create({
                key: `${key}:boom`,
                frames: this.anims.generateFrameNumbers(key, { start: spin, end: proj.frames - 1 }),
                frameRate: proj.boomFrameRate ?? 12, repeat: 0,
              });
            });
          });
        }
      }

      // Syncs player and enemy sprites with server updates every frame.
      update(_time, delta) {
        this.syncSprites(this.serverPlayers, this.playerSprites, 'playerId', p => this.resolvePlayerConfig(p));
        if (enemiesManifest) {
          this.syncSprites(this.serverEnemies, this.enemySprites, 'id', e => this.resolveEnemyConfig(e));
        }
        this.syncProjectiles();
        drawHearts(this);
        drawPvp(this);
        if (this.rainDrops) updateWeather(this, delta / 1000);
      }

      // Resolves the asset configuration and animations for a player.
      resolvePlayerConfig(entity) {
        const key = entity?.character ?? playersManifest.defaultPlayer;
        const def = resolvePlayerDefinition(key);
        const prefix = playerAnimationPrefix(def), anims = def.animations;
        return {
          textureKey: def.assetMode === 'animationSheets' ? `${prefix}:${def.defaultAnimation}` : def.textureKey,
          idleAnim: `${prefix}:${def.defaultAnimation}`,
          walkAnim: anims.walk ? `${prefix}:walk` : null,
          actions: {
            attack: Object.keys(anims).filter(n => n.startsWith('attack')).map(n => `${prefix}:${n}`),
            death: anims.death ? `${prefix}:death` : null,
            hurt: anims.take_hit ? `${prefix}:take_hit` : anims.hurt ? `${prefix}:hurt` : null,
          },
          scale: def.render.scale, origin: def.render.origin, bodyHeight: def.render.bodyHeight ?? null,
        };
      }

      // Resolves the asset configuration and animations for an enemy.
      resolveEnemyConfig(enemy) {
        const def = enemiesManifest.enemies[enemy.type];
        const prefix = def.textureKeyPrefix, anims = def.animations;
        return {
          textureKey: `${prefix}:${def.defaultAnimation}`, idleAnim: `${prefix}:${def.defaultAnimation}`,
          walkAnim: anims.walk ? `${prefix}:walk` : anims.run ? `${prefix}:run` : null,
          actions: {
            attack: Object.keys(anims).filter(n => n.startsWith('attack')).map(n => `${prefix}:${n}`),
            throw: anims.throw ? `${prefix}:throw` : null,
            death: anims.death ? `${prefix}:death` : null,
            hurt: anims.take_hit ? `${prefix}:take_hit` : anims.hurt ? `${prefix}:hurt` : null,
          },
          scale: def.render.scale, origin: def.render.origin,
        };
      }

      // Average body color of an entity's spritesheet (first frame), cached per texture, so shards match what they burst from.
      entityColor(textureKey) {
        this.colorCache ??= new Map();
        if (!this.colorCache.has(textureKey)) {
          const frame = this.textures.getFrame(textureKey, 0);
          const steps = 7;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 1; frame && i < steps; i++) {
            for (let j = 1; j < steps; j++) {
              const px = this.textures.getPixel(
                Math.floor((frame.width * i) / steps),
                Math.floor((frame.height * j) / steps),
                textureKey, 0,
              );
              if (px && px.alpha > 128) { r += px.red; g += px.green; b += px.blue; n++; }
            }
          }
          this.colorCache.set(textureKey, n
            ? Phaser.Display.Color.GetColor(Math.round(r / n), Math.round(g / n), Math.round(b / n))
            : 0x8a7f70);
        }
        return this.colorCache.get(textureKey);
      }

      onScreen(x) {
        return x > -GAME_VIEW.fadeZone && x < GAME_VIEW.screenWidth + GAME_VIEW.fadeZone;
      }

      // Flies bombs along their arc and plays the explosion when they land.
      syncProjectiles() {
        const active = new Set();
        for (const proj of this.serverProjectiles) {
          active.add(proj.id);
          const localX = proj.x - this.cameraOffset;
          let sprite = this.projectileSprites.get(proj.id);
          if (!sprite) {
            sprite = this.add.sprite(localX, proj.y, proj.sprite, 0).setScale(proj.scale ?? 0.8).setDepth(proj.y + 40);
            sprite.exploded = false;
            // Point the bolt along its flight heading (art faces right at angle 0).
            if (proj.angle != null) sprite.setRotation(proj.angle);
            sprite.play(`${proj.sprite}:spin`);
            this.projectileSprites.set(proj.id, sprite);
          }
          sprite.setPosition(localX, proj.y);
          if (proj.exploded && !sprite.exploded) {
            sprite.exploded = true;
            sprite.setRotation(0); // blast plays upright, not tilted along the flight angle
            sprite.setDepth(100000); // blast draws over everything
            sprite.play(`${proj.sprite}:boom`);
            // Only the screen the blast lands on shakes, so a distant bomb doesn't rattle every screen.
            if (this.onScreen(localX)) this.cameras.main.shake(140, 0.004);
            spillShards(this, localX, proj.y, [0x8a4b12, 0x5a3208, 0xc26a1a],
              { count: 14, minLife: 250, maxLife: 550 });
          }
          sprite.setVisible(this.onScreen(localX));
        }
        for (const [id, sprite] of this.projectileSprites) {
          if (!active.has(id)) {
            sprite.destroy();
            this.projectileSprites.delete(id);
          }
        }
      }

      // Updates sprite positions, plays animations, and manages visibility based on server state.
      syncSprites(list, spriteMap, idKey, resolve) {
        const screenW = GAME_VIEW.screenWidth, fade = GAME_VIEW.fadeZone;
        const isFirst = screenNumber === 1, isLast = screenNumber >= mapScreens;
        const activeIds = new Set();

        for (const entity of list) {
          const id = entity[idKey];
          activeIds.add(id);
          const localX = entity.x - this.cameraOffset;

          let sprite = spriteMap.get(id);
          if (!sprite) {
            const cfg = resolve(entity);
            sprite = this.add.sprite(localX, entity.y, cfg.textureKey, 0).setOrigin(cfg.origin.x, cfg.origin.y).setScale(cfg.scale);
            Object.assign(sprite, { cfg, wx: entity.x, wy: entity.y, still: 999, lockKey: null, lastAction: null, hpBar: this.add.graphics() });
            if (cfg.idleAnim) sprite.play(cfg.idleAnim);
            spriteMap.set(id, sprite);
          }

          const actions = sprite.cfg.actions;
          if (entity.action && actions && sprite.lastAction !== entity.action) {
            sprite.lastAction = entity.action;
            let key = null;
            if (entity.action === 'attack' && actions.attack?.length) {
              key = actions.attack[Math.floor(Math.random() * actions.attack.length)];
            } else if (entity.action === 'throw' && actions.throw) {
              key = actions.throw;
            } else if (entity.action === 'death') {
              key = actions.death;
              const color = this.entityColor(sprite.cfg.textureKey);
              if (idKey === 'playerId') deathBurst(this, localX, entity.y, color);
              else spillShards(this, localX, entity.y, color, { count: 12, minLife: 300, maxLife: 600 });
            } else if ((entity.action === 'take_hit' || entity.action === 'hurt') && actions.hurt) {
              key = actions.hurt;
              // Enemies spark in their own color; players bleed blood-red so player damage stands out.
              const isPlayer = idKey === 'playerId';
              spillShards(this, localX, entity.y, isPlayer ? [0x8a0303, 0x6e0d0d, 0xa31212] : this.entityColor(sprite.cfg.textureKey),
                { count: isPlayer ? 7 : 5, maxSpeed: 120, minLife: 180, maxLife: 320, follow: sprite });
              // Recolor the white flash of the hurt animation into a red damage flash.
              if (isPlayer) sprite.hurtTintUntil = this.time.now + 300;
            }
            if (key) {
              sprite.lockKey = key;
              sprite.play(key);
              sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.lockKey = null);
            }
          }
          if (!entity.action) sprite.lastAction = null;

          const locked = sprite.lockKey !== null || entity.action === 'death' || entity.dead;
          const dx = entity.x - sprite.wx, dy = entity.y - sprite.wy;
          sprite.wx = entity.x; sprite.wy = entity.y;

          if (!locked) {
            if (dx * dx + dy * dy > 0.25) {
              sprite.still = 0;
              if (Math.abs(dx) > 0.1) sprite.setFlipX(dx < 0);
            } else {
              sprite.still++;
            }
            const wantAnim = sprite.still < 6 && sprite.cfg.walkAnim ? sprite.cfg.walkAnim : sprite.cfg.idleAnim;
            if (wantAnim && sprite.anims.currentAnim?.key !== wantAnim) sprite.play(wantAnim);
          }

          sprite.setPosition(localX, entity.y);

          let alpha = isFirst ? 1 : Math.min(1, localX / fade);
          if (!isLast) alpha = Math.min(alpha, (screenW - localX) / fade);
          if (entity.dead) alpha *= 0.4;

          sprite.setAlpha(Phaser.Math.Clamp(alpha, 0, 1)).setTint(
            entity.dead ? 0x777777
              : this.time.now < (sprite.hurtTintUntil || 0) ? 0xd63b3b
              : this.time.now < (sprite.healTintUntil || 0) ? 0x5bffa0
              : 0xffffff,
          );

          const visible = localX > -fade && localX < screenW + fade;
          sprite.setVisible(visible).setDepth(entity.y);
          this.drawHealthBar(sprite, entity, localX, visible, idKey);
          if (idKey === 'playerId') {
            // Detect a heal (only hearts raise HP) and pop a green "+N" + flash. Guard against the respawn HP reset (was dead / HP was 0).
            if (sprite.lastHp != null && sprite.lastHp > 0 && !entity.dead && entity.hp > sprite.lastHp) {
              if (visible) healPopup(this, localX, entity.y);
              sprite.healTintUntil = this.time.now + 350;
            }
            sprite.lastHp = entity.hp;
          }
        }

        for (const [id, sprite] of spriteMap) {
          if (!activeIds.has(id)) {
            sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
            sprite.hpBar.destroy();
            sprite.destroy();
            spriteMap.delete(id);
          }
        }
      }

      // Draws a health bar above a player or damaged enemy.
      drawHealthBar(sprite, entity, localX, visible, idKey) {
        const g = sprite.hpBar.clear();
        const hp = entity.hp, max = entity.maxHp;
        const show = visible && !entity.dead && hp != null && max > 0 && hp > 0 && (idKey === 'playerId' || hp < max);
        if (!show) return g.setVisible(false);

        // Sized to roughly the sprite's shoulder width; enemies get a slightly narrower bar.
        const w = idKey === 'playerId' ? 32 : 28, h = 4;
        const bodyTop = sprite.cfg.bodyHeight != null ? sprite.cfg.bodyHeight * sprite.scaleY : sprite.displayHeight * sprite.originY;
        const top = entity.y - bodyTop - 12;
        const frac = Phaser.Math.Clamp(hp / max, 0, 1);
        // Enemies always red; players go green with the low-HP warning stages kept.
        const color = idKey !== 'playerId' ? 0xe0394c
          : frac > 0.5 ? 0x5f7160 : frac > 0.25 ? 0xffcc00 : 0xdd3333;

        g.fillStyle(0x141b1b, 0.9).fillRect(localX - w / 2 - 1, top - 1, w + 2, h + 2);
        g.fillStyle(color, 1).fillRect(localX - w / 2, top, w * frac, h);
        g.setDepth(entity.y + 1).setVisible(true);
      }

    }

    // Phaser engine configuration settings.
    const config = {
      type: Phaser.WEBGL,
      width: GAME_VIEW.screenWidth, height: GAME_VIEW.screenHeight,
      parent: 'game-container', backgroundColor: '#2d2d2d', pixelArt: true,
      render: { powerPreference: 'high-performance', antialias: false }, fps: { limit: 30 },
      scene: LgRPG, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
    };
    new Phaser.Game(config);
  } catch (e) {
    console.error('Error loading configuration or initializing game:', e);
  }
}

startGame();
