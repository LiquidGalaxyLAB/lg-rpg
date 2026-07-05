// Client-side game logic that renders the map, sprites, and UI using Phaser.
import { GAME_VIEW, GAME_PHASES, SOCKET_EVENTS } from './shared_constants.js';

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
      }

      // Loads map JSON, tileset images, player spritesheets, and enemy spritesheets.
      preload() {
        this.load.tilemapTiledJSON(mapConfig.key, `assets/${mapConfig.path}`);
        (mapConfig.tilesets || []).forEach(t => this.load.image(t.key, `assets/${t.path}`));
        this.load.spritesheet('heart', 'assets/items/heart.png', { frameWidth: 16, frameHeight: 16 });
        
        Object.values(playersManifest.players).forEach(p => {
          this.load.spritesheet(p.textureKey, `assets/${p.assetPath}`, { frameWidth: p.frame.width, frameHeight: p.frame.height });
        });

        if (enemiesManifest) {
          Object.values(enemiesManifest.enemies).forEach(def => {
            const { width, height } = def.frame;
            Object.entries(def.animations).forEach(([animName, anim]) => {
              this.load.spritesheet(`${def.textureKeyPrefix}:${animName}`, `assets/${anim.path}`, { frameWidth: width, frameHeight: height });
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
        this.heartSprites = new Map();
        this.anims.create({
          key: 'heart:pulse',
          frames: this.anims.generateFrameNumbers('heart', { start: 0, end: 5 }),
          frameRate: 8, repeat: -1,
        });

        socket.on(SOCKET_EVENTS.GAME_STATE, d => {
          this.serverPlayers = d.players || [];
          this.serverEnemies = d.enemies || [];
          this.serverHearts = d.hearts || [];
          this.serverMatch = d.match || null;
          this.serverPvp = d.pvp || null;
        });

        socket.on(SOCKET_EVENTS.GAME_OVER, () => {
          this.phase = GAME_PHASES.LOBBY;
          this.showWaiting();
        });

        socket.on(SOCKET_EVENTS.GAME_STARTED, d => {
          if (d?.map?.key && d.map.key !== mapConfig.key) return window.location.reload();
          this.phase = GAME_PHASES.PLAYING;
          this.hideWaiting();
        });

        this.phase = configData.phase || GAME_PHASES.LOBBY;
        if (this.phase !== GAME_PHASES.PLAYING) this.showWaiting();

        Object.values(playersManifest.players).forEach(def => {
          Object.entries(def.animations).forEach(([name, anim]) => {
            this.anims.create({
              key: `${def.textureKey}:${name}`,
              frames: this.anims.generateFrameNumbers(def.textureKey, { start: anim.frames.start, end: anim.frames.end }),
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
          });
        }
      }

      // Syncs player and enemy sprites with server updates every frame.
      update() {
        this.syncSprites(this.serverPlayers, this.playerSprites, 'playerId', p => this.resolvePlayerConfig(p));
        if (enemiesManifest) {
          this.syncSprites(this.serverEnemies, this.enemySprites, 'id', e => this.resolveEnemyConfig(e));
        }
        this.drawHearts();
        this.drawPvp();
      }

      // Renders the PvP capture zones, team spawn boxes, and team markers under each player.
      drawPvp() {
        const g = this.pvpGraphics.clear();
        const pvp = this.serverPvp;
        if (!pvp) return;
        const off = this.cameraOffset, W = GAME_VIEW.screenWidth;
        const teamColor = (t) => (t === 'teamA' ? 0x1f6feb : t === 'teamB' ? 0xda3633 : 0xffffff);

        for (const z of pvp.zones || []) {
          const c = teamColor(z.currentTeam);
          if (z.ellipse) {
            const cx = z.x + z.width / 2 - off, cy = z.y + z.height / 2;
            g.fillStyle(c, 0.18).fillEllipse(cx, cy, z.width, z.height);
            g.lineStyle(3, c, 0.9).strokeEllipse(cx, cy, z.width, z.height);
          } else {
            g.fillStyle(c, 0.18).fillRect(z.x - off, z.y, z.width, z.height);
            g.lineStyle(3, c, 0.9).strokeRect(z.x - off, z.y, z.width, z.height);
          }
        }
        for (const team of ['teamA', 'teamB']) {
          const b = pvp.spawns?.[team];
          if (!b) continue;
          g.lineStyle(2, teamColor(team), 0.85).strokeRect(b.x - off, b.y, b.width, b.height);
        }
        for (const p of this.serverPlayers) {
          if (!p.team) continue;
          const lx = p.x - off;
          if (lx < -40 || lx > W + 40) continue;
          g.fillStyle(teamColor(p.team), p.dead ? 0.25 : 0.9);
          g.fillCircle(lx, p.y - 2, 7);
        }
      }

      // Syncs the animated heart pickup sprites with server state.
      drawHearts() {
        const activeIds = new Set();
        for (const heart of this.serverHearts) {
          activeIds.add(heart.id);
          const localX = heart.x - this.cameraOffset;
          let sprite = this.heartSprites.get(heart.id);
          if (!sprite) {
            sprite = this.add.sprite(localX, heart.y, 'heart', 0).setOrigin(0.5).setScale(2).setDepth(1);
            sprite.play('heart:pulse');
            this.heartSprites.set(heart.id, sprite);
          }
          sprite.setPosition(localX, heart.y);
          sprite.setVisible(localX > -40 && localX < GAME_VIEW.screenWidth + 40);
        }
        for (const [id, sprite] of this.heartSprites) {
          if (!activeIds.has(id)) {
            sprite.destroy();
            this.heartSprites.delete(id);
          }
        }
      }

      // Resolves the asset configuration and animations for a player.
      resolvePlayerConfig(entity) {
        const key = entity?.character ?? playersManifest.defaultPlayer;
        const def = playersManifest.players[key] ?? playersManifest.players[playersManifest.defaultPlayer];
        const prefix = def.textureKey, anims = def.animations;
        return {
          textureKey: def.textureKey,
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
            death: anims.death ? `${prefix}:death` : null,
          },
          scale: def.render.scale, origin: def.render.origin,
        };
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
            } else if (entity.action === 'death') {
              key = actions.death;
            } else if ((entity.action === 'take_hit' || entity.action === 'hurt') && actions.hurt) {
              key = actions.hurt;
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
          sprite.setAlpha(Phaser.Math.Clamp(alpha, 0, 1)).setTint(entity.dead ? 0x777777 : 0xffffff);

          const visible = localX > -fade && localX < screenW + fade;
          sprite.setVisible(visible).setDepth(entity.y);
          this.drawHealthBar(sprite, entity, localX, visible, idKey);
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

        const w = 50, h = 6;
        const bodyTop = sprite.cfg.bodyHeight != null ? sprite.cfg.bodyHeight * sprite.scaleY : sprite.displayHeight * sprite.originY;
        const top = entity.y - bodyTop - 12;
        const frac = Phaser.Math.Clamp(hp / max, 0, 1);
        const color = frac > 0.5 ? 0x44dd44 : frac > 0.25 ? 0xffcc00 : 0xdd3333;

        g.fillStyle(0x000000, 0.6).fillRect(localX - w / 2 - 1, top - 1, w + 2, h + 2);
        g.fillStyle(color, 1).fillRect(localX - w / 2, top, w * frac, h);
        g.setDepth(entity.y + 1).setVisible(true);
      }

      // Displays a waiting overlay before the match starts.
      showWaiting() {
        if (this.waitingObjects?.length) return;
        const w = GAME_VIEW.screenWidth, h = GAME_VIEW.screenHeight;
        this.waitingObjects = [
          this.add.rectangle(w / 2, h / 2, w, h, 0x1a1a1a, 1).setDepth(9000),
          this.add.text(w / 2, h / 2, 'Waiting for the match to start…', {
            fontFamily: 'monospace', fontSize: '44px', color: '#ffffff', align: 'center', wordWrap: { width: w * 0.8 }
          }).setOrigin(0.5).setDepth(9001)
        ];
      }

      // Hides the waiting overlay.
      hideWaiting() {
        (this.waitingObjects || []).forEach(obj => obj.destroy());
        this.waitingObjects = [];
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
