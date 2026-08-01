// Client-side game logic that renders the map, sprites, and UI using Phaser.
import { GAME_VIEW, GAME_PHASES, SOCKET_EVENTS } from './shared_constants.js';
import { drawPvp, drawHearts, showWaiting, hideWaiting } from './scene/overlays.js';
import { createLeaderboard, updateLeaderboard, setLeaderboardAnnouncement } from './scene/leaderboard.js';
import { initGameAudio } from './game_audio.js';
import { createWeather, updateWeather } from './scene/weather.js';
import { deathBurst, spillShards, healPopup, sparkleBurst, updateShieldFx, updateAuraFx, playAttackFx } from './scene/effects.js';

// Map tile layers and decals render below every entity; the band is deep enough for any layer count.
const MAP_DEPTH_BASE = -1000;

// Keep map branding smaller than its Tiled box; GSoC gets a slight boost to match LG's visual footprint.
const DECAL_SCALE_FACTOR = 0.8;
const GSOC_SCALE_FACTOR = 0.88;

// Visual-only boost over each manifest's render scale so characters read on the LG wall; server hitboxes are untouched, and projectiles are server-scaled instead.
const ENTITY_SCALE_BOOST = 1.3;

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

// Fetches config and assets, then starts the Phaser instance.
async function startGame() {
  try {
    const configData = await fetchJson('/api/config');
    const mapConfig = configData.map;

    if (!mapConfig?.key || !mapConfig?.path) {
      throw new Error('Game config is missing the map key or path.');
    }

    // Every screen shows a slice of the map.
    const mapScreens = configData.totalScreens;
    if (screenNumber < 1 || screenNumber > mapScreens) {
      showScreenNotice(`Screen ${screenNumber} is out of range.\nGame screens are 1–${mapScreens}.`);
      return;
    }

    // The last screen's machine is wired to the rig's speakers, so it plays the music and commentary.
    if (screenNumber === configData.totalScreens) {
      initGameAudio(socket).setMode(configData.selectedMode);
    } else {
      console.log(`[audio] screen ${screenNumber} is not the audio host (host is screen ${configData.totalScreens}) — silent by design.`);
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

      preload() {
        this.load.tilemapTiledJSON(mapConfig.key, `assets/${mapConfig.path}`);
        (mapConfig.tilesets || []).forEach(t => this.load.image(t.key, `assets/${t.path}`));
        (mapConfig.decals || []).forEach(d => this.load.image(d.key, `assets/${d.path}`));
        this.load.spritesheet('heart', 'assets/items/heart.png', { frameWidth: 16, frameHeight: 16 });
        this.load.spritesheet('fx:sparkle', 'assets/fx/boost_sparkles.png', { frameWidth: 53, frameHeight: 35 });
        this.load.spritesheet('fx:shield', 'assets/fx/shield_bubble_blue.png', { frameWidth: 24, frameHeight: 26 });
        this.load.spritesheet('fx:shield:reflect', 'assets/fx/shield_bubble_yellow.png', { frameWidth: 24, frameHeight: 26 });
        this.load.spritesheet('fx:aura', 'assets/fx/heal_aura.png', { frameWidth: 25, frameHeight: 24 });
        // The swing is a 360° radial, so it gets the circular sweep rather than a directional arc; the rest are the water priestess's specials.
        this.load.spritesheet('fx:swing', 'assets/fx/slash_circular.png', { frameWidth: 63, frameHeight: 55 });
        this.load.spritesheet('fx:riptide', 'assets/fx/slash_multi.png', { frameWidth: 45, frameHeight: 30 });
        this.load.spritesheet('fx:tide', 'assets/fx/water_pillar.png', { frameWidth: 30, frameHeight: 41 });
        this.load.spritesheet('fx:frost', 'assets/fx/frost_nova.png', { frameWidth: 32, frameHeight: 32 });
        this.load.spritesheet('fx:blessing', 'assets/fx/spirit_blessing.png', { frameWidth: 32, frameHeight: 32 });

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
          Object.entries(p.projectiles || {}).forEach(([name, proj]) => {
            this.load.spritesheet(`${playerAnimationPrefix(p)}:proj:${name}`, `assets/${proj.path}`,
              { frameWidth: proj.frame.width, frameHeight: proj.frame.height });
          });
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

      create() {
        const map = this.make.tilemap({ key: mapConfig.key, tileWidth: 16, tileHeight: 16 });
        const tilesets = (mapConfig.tilesets || [])
          .map(t => map.addTilesetImage(t.name, t.key, undefined, undefined, undefined, undefined, t.firstgid))
          .filter(Boolean);
        this.cameraOffset = (screenNumber - 1) * GAME_VIEW.screenWidth;
        this.mapLayers = [];
        // Every tile layer straight from the TMJ in file order, so a redrawn map never needs a maps.json update. `Divider` layers only mark screen borders in the editor. The negative depth band keeps tile layers from ever tying with hearts (1), pvp overlays (2) or sprites (depth = world y).
        map.layers.forEach((layerData, index) => {
          if (layerData.name.toLowerCase() === 'divider') return;
          const layer = map.createLayer(layerData.name, tilesets, -this.cameraOffset, 0);
          if (layer) {
            layer.setDepth(MAP_DEPTH_BASE + index);
            this.mapLayers.push(layer);
          }
        });
        // Static branding fitted into a Tiled object rectangle: the decal's `name` is the object layer, its first rectangle is the box, and the image is contained (never stretched) and centred inside.
        (mapConfig.decals || []).forEach(d => {
          const box = map.getObjectLayer(d.name)?.objects?.[0];
          if (!box) { console.warn(`Decal box not found: ${d.name}`); return; }
          const img = this.add.image(0, 0, d.key).setOrigin(0.5);
          const filter = d.name === 'gsoc'
            ? Phaser.Textures.FilterMode.NEAREST
            : Phaser.Textures.FilterMode.LINEAR;
          img.texture.setFilter(filter);
          const decalScaleFactor = d.name === 'gsoc' ? GSOC_SCALE_FACTOR : DECAL_SCALE_FACTOR;
          const scale = Math.min(box.width / img.width, box.height / img.height) * decalScaleFactor;
          img.setDisplaySize(img.width * scale, img.height * scale);
          img.setPosition(box.x + box.width / 2 - this.cameraOffset, box.y + box.height / 2);
          img.setDepth(MAP_DEPTH_BASE + map.layers.length);
        });
        // Framed by the map's `leaderboard` object rectangle; only drawn by screens whose slice overlaps it.
        createLeaderboard(this, map, configData);
        // Above the ground but below sprites (which use depth = world y).
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
        this.anims.create({
          key: 'fx:shield:spin',
          frames: this.anims.generateFrameNumbers('fx:shield', { start: 0, end: 5 }),
          frameRate: 10, repeat: -1,
        });
        this.anims.create({
          key: 'fx:shield:reflect:spin',
          frames: this.anims.generateFrameNumbers('fx:shield:reflect', { start: 0, end: 5 }),
          frameRate: 10, repeat: -1,
        });
        this.anims.create({
          key: 'fx:aura:pulse',
          frames: this.anims.generateFrameNumbers('fx:aura', { start: 0, end: 4 }),
          frameRate: 8, repeat: -1,
        });
        // One-shot attack FX in the same 8-12fps band as the buffs above, so they read as deliberate. Matching the server's damage windows exactly made them too fast to see, so the FX is allowed to outlast its ability.
        [
          { key: 'fx:swing', frames: 6, frameRate: 12 },
          { key: 'fx:tide', frames: 9, frameRate: 11 },
          { key: 'fx:riptide', frames: 6, frameRate: 12 },
          { key: 'fx:frost', frames: 10, frameRate: 12 },
          { key: 'fx:blessing', frames: 5, frameRate: 7 },
        ].forEach(fx => this.anims.create({
          key: `${fx.key}:play`,
          frames: this.anims.generateFrameNumbers(fx.key, { start: 0, end: fx.frames - 1 }),
          frameRate: fx.frameRate, repeat: 0,
        }));

        socket.on(SOCKET_EVENTS.GAME_STATE, d => {
          this.serverPlayers = d.players || [];
          this.serverEnemies = d.enemies || [];
          this.serverProjectiles = d.projectiles || [];
          this.serverHearts = d.hearts || [];
          this.serverMatch = d.match || null;
          this.serverPvp = d.pvp || null;
        });

        socket.on(SOCKET_EVENTS.GAME_OVER, d => {
          this.phase = GAME_PHASES.LOBBY;
          this.serverFinal = d || null;
          showWaiting(this);
        });

        socket.on(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, (d = {}) => {
          if (d.message) setLeaderboardAnnouncement(this, d.message, d.durationMs);
        });

        socket.on(SOCKET_EVENTS.GAME_STARTED, d => {
          if (d?.map?.key && d.map.key !== mapConfig.key) return window.location.reload();
          this.phase = GAME_PHASES.PLAYING;
          this.serverFinal = null;
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
          // Split each projectile sheet at spinFrames into a looping "spin" (in flight) and a one-shot "boom" (impact).
          Object.entries(def.projectiles || {}).forEach(([name, proj]) => {
            const key = `${prefix}:proj:${name}`;
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

      update(_time, delta) {
        this.syncSprites(this.serverPlayers, this.playerSprites, 'playerId', p => this.resolvePlayerConfig(p));
        if (enemiesManifest) {
          this.syncSprites(this.serverEnemies, this.enemySprites, 'id', e => this.resolveEnemyConfig(e));
        }
        this.syncProjectiles();
        drawHearts(this);
        drawPvp(this);
        updateLeaderboard(this);
        if (this.rainDrops) updateWeather(this, delta / 1000);
      }

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
          scale: def.render.scale * ENTITY_SCALE_BOOST, origin: def.render.origin, bodyHeight: def.render.bodyHeight ?? null,
        };
      }

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
          scale: def.render.scale * ENTITY_SCALE_BOOST, origin: def.render.origin, bodyHeight: def.render.bodyHeight ?? null,
        };
      }

      // Average body color of the sheet's first frame, cached per texture, so shards match what they burst from.
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

      syncProjectiles() {
        const active = new Set();
        for (const proj of this.serverProjectiles) {
          active.add(proj.id);
          const localX = proj.x - this.cameraOffset;
          let sprite = this.projectileSprites.get(proj.id);
          if (!sprite) {
            sprite = this.add.sprite(localX, proj.y, proj.sprite, 0).setScale(proj.scale ?? 0.8).setDepth(proj.y + 40);
            sprite.exploded = false;
            // Art faces right at angle 0.
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

      // Reconciles sprite position, animation and visibility against the server state.
      syncSprites(list, spriteMap, idKey, resolve) {
        const screenW = GAME_VIEW.screenWidth, fade = GAME_VIEW.fadeZone;
        const isFirst = screenNumber === 1, isLast = screenNumber >= mapScreens;
        const activeIds = new Set();

        for (const entity of list) {
          const id = entity[idKey];
          activeIds.add(id);
          const localX = entity.x - this.cameraOffset;

          // Skin the sprite is drawn with; a character switch keeps the same id, so cfg must resync.
          const skin = entity.character ?? entity.type ?? null;

          let sprite = spriteMap.get(id);
          if (!sprite) {
            const cfg = resolve(entity);
            sprite = this.add.sprite(localX, entity.y, cfg.textureKey, 0).setOrigin(cfg.origin.x, cfg.origin.y).setScale(cfg.scale);
            Object.assign(sprite, { cfg, skin, wx: entity.x, wy: entity.y, still: 999, lockKey: null, lastAction: null, hpBar: this.add.graphics() });
            if (cfg.idleAnim) sprite.play(cfg.idleAnim);
            spriteMap.set(id, sprite);
          } else if (sprite.skin !== skin) {
            // Restyle in place so health bars, tints and effects carry over.
            const cfg = resolve(entity);
            sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
            sprite.setTexture(cfg.textureKey, 0).setOrigin(cfg.origin.x, cfg.origin.y).setScale(cfg.scale);
            Object.assign(sprite, { cfg, skin, lockKey: null, lastAction: null });
            if (cfg.idleAnim) sprite.play(cfg.idleAnim);
          }

          const actions = sprite.cfg.actions;
          // Two swings in a row are both 'attack', so the FX edge keys on the pair; the server nulls `action` between them.
          const actionSig = entity.action ? `${entity.action}:${entity.actionKind ?? ''}` : null;
          if (entity.action && actions && sprite.lastAction !== actionSig) {
            sprite.lastAction = actionSig;
            let key = null;
            if (entity.action === 'attack' && actions.attack?.length) {
              key = actions.attack[Math.floor(Math.random() * actions.attack.length)];
              if (idKey === 'playerId') playAttackFx(this, entity.actionKind, localX, entity.y, sprite);
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

          // Enemies square up to the target even mid-animation, so a stationary slime never swings facing away.
          if (entity.face && !entity.dead && entity.action !== 'death') sprite.setFlipX(entity.face < 0);

          if (!locked) {
            if (dx * dx + dy * dy > 0.25) {
              sprite.still = 0;
              if (!entity.face && Math.abs(dx) > 0.1) sprite.setFlipX(dx < 0);
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
                  : entity.boost ? 0x8fe3ff
                    : entity.power ? 0xff8fd0
                      : 0xffffff,
          );

          const visible = localX > -fade && localX < screenW + fade;
          sprite.setVisible(visible).setDepth(entity.y);
          this.drawHealthBar(sprite, entity, localX, visible, idKey);
          if (idKey === 'playerId') {
            // A heal pops a green "+N" and flash; the guards keep the respawn HP reset from counting as one.
            if (sprite.lastHp != null && sprite.lastHp > 0 && !entity.dead && entity.hp > sprite.lastHp) {
              if (visible) healPopup(this, localX, entity.y);
              sprite.healTintUntil = this.time.now + 350;
            }
            sprite.lastHp = entity.hp;
            // One sparkle burst on activation, plus the glow tint above.
            if (entity.boost && !entity.dead) {
              if (!sprite.boosted) { sprite.boosted = true; sparkleBurst(this, localX, entity.y, sprite, 16, -10); }
            } else {
              sprite.boosted = false;
            }
            updateShieldFx(this, sprite, entity, localX, visible);
            updateAuraFx(this, sprite, entity, localX, visible);
          }
        }

        for (const [id, sprite] of spriteMap) {
          if (!activeIds.has(id)) {
            sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
            sprite.hpBar.destroy();
            if (sprite.shieldFx) sprite.shieldFx.destroy();
            if (sprite.auraFx) sprite.auraFx.destroy();
            if (sprite.attackFx) sprite.attackFx.destroy();
            sprite.destroy();
            spriteMap.delete(id);
          }
        }
      }

      // Players always show a bar; enemies only once damaged.
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
        // Enemies always red; players go green through the low-HP warning stages.
        const color = idKey !== 'playerId' ? 0xe0394c
          : frac > 0.5 ? 0x5f7160 : frac > 0.25 ? 0xffcc00 : 0xdd3333;

        g.fillStyle(0x141b1b, 0.9).fillRect(localX - w / 2 - 1, top - 1, w + 2, h + 2);
        g.fillStyle(color, 1).fillRect(localX - w / 2, top, w * frac, h);
        g.setDepth(entity.y + 1).setVisible(true);
      }
    }

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
