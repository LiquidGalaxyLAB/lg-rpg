import { GAME_VIEW, SOCKET_EVENTS } from './shared_constants.js';

const urlParams = new URLSearchParams(window.location.search);
const screenNumber = parseInt(urlParams.get('screen')) || 1;

const socket = io();

async function startGame() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`Failed to load game config: ${response.status}`);
    }

    const configData = await response.json();
    const mapConfig = configData.map;

    if (!mapConfig?.key || !mapConfig?.path || !mapConfig?.layers?.ground) {
      throw new Error('Game config is missing map key, path, or ground layer.');
    }

    class LgRPG extends Phaser.Scene {
      constructor() {
        super('LgRPG');
        this.serverPlayers = [];
        this.playerSprites = new Map();
      }

      preload() {
        this.load.tilemapTiledJSON(mapConfig.key, `assets/${mapConfig.path}`);
        for (const tileset of mapConfig.tilesets || []) {
          this.load.image(tileset.key, `assets/${tileset.path}`);
        }
        this.load.spritesheet('water_priestess',
          'assets/players/cherit/water_priestess_288x128.png',
          { frameWidth: 288, frameHeight: 128 }
        );
      }

      create() {
        const map = this.make.tilemap({ key: mapConfig.key, tileWidth: 16, tileHeight: 16 });
        const tilesets = (mapConfig.tilesets || [])
          .map((tileset) => map.addTilesetImage(tileset.name, tileset.key))
          .filter(Boolean);
        this.cameraOffset = (screenNumber - 1) * GAME_VIEW.screenWidth;
        map.createLayer(mapConfig.layers.ground, tilesets, -this.cameraOffset, 0);

        // Listen for game state from server
        socket.on(SOCKET_EVENTS.GAME_STATE, (data) => {
          this.serverPlayers = data.players || [];
        });

        // Create idle animation once
        this.anims.create({
          key: 'water_idle',
          frames: this.anims.generateFrameNumbers('water_priestess', { start: 0, end: 3 }),
          frameRate: 6,
          repeat: -1,
        });
      }

      update() {
        const activeIds = new Set();
        const screenW = GAME_VIEW.screenWidth;
        const fade = GAME_VIEW.fadeZone;
        // Outer world edges have no neighbour, so they must never fade.
        const isFirst = screenNumber === 1;
        const isLast = screenNumber >= configData.totalScreens;

        for (const p of this.serverPlayers) {
          activeIds.add(p.playerId);
          const localX = p.x - this.cameraOffset;

          // Create sprite if new
          if (!this.playerSprites.has(p.playerId)) {
            const sprite = this.add.sprite(localX, p.y, 'water_priestess', 0)
              .setOrigin(0.5, 1)
              .setScale(4);
            sprite.play('water_idle');
            this.playerSprites.set(p.playerId, sprite);
          }

          const sprite = this.playerSprites.get(p.playerId);
          sprite.setPosition(localX, p.y);

          let alpha = 1;
          if (!isFirst) alpha = Math.min(alpha, localX / fade);
          if (!isLast) alpha = Math.min(alpha, (screenW - localX) / fade);
          sprite.setAlpha(Phaser.Math.Clamp(alpha, 0, 1));

          sprite.setVisible(localX > -fade && localX < screenW + fade);
        }

        // Remove sprites for disconnected players
        for (const [id, sprite] of this.playerSprites) {
          if (!activeIds.has(id)) {
            sprite.destroy();
            this.playerSprites.delete(id);
          }
        }
      }
    }

    const config = {
      type: Phaser.AUTO,
      width: GAME_VIEW.screenWidth,
      height: GAME_VIEW.screenHeight,
      parent: 'game-container',
      backgroundColor: '#2d2d2d',
      scene: LgRPG,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };
    new Phaser.Game(config);
  } catch (e) {
    console.error('Error loading configuration or initializing game:', e);
  }
}

startGame();
