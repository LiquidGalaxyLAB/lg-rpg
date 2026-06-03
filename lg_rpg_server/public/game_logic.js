const urlParams = new URLSearchParams(window.location.search);
const screenNumber = parseInt(urlParams.get('screen')) || 1;

console.log(`Running on Screen Number: ${screenNumber}`);


async function startGame() {
    try {
        const response = await fetch('/api/config');
        const configData = await response.json();
        const totalScreens = configData.totalScreens;

        let mapPath = 'assets/maps/zombie_raid_map_3_screen.tmj';
        if (totalScreens === 5) {
            mapPath = 'assets/maps/zombie_raid_map_5_screen.tmj';
        }

        class LgRPG extends Phaser.Scene {
            constructor() {
                super('LgRPG');
            }
            preload() {
                this.load.tilemapTiledJSON('map', mapPath);
                this.load.image('ground', 'assets/ninja-adventure-asset-pack/Backgrounds/Tilesets/TilesetFloor.png');
            };

            create() {
                const map = this.make.tilemap({
                    key: 'map',
                    tileWidth: 16,
                    tileHeight: 16,
                });
                const tileset = map.addTilesetImage('TilesetFloor', 'ground');

                const screenWidth = 1080;

                const cameraOffset = (screenNumber - 1) * screenWidth;
                this.cameras.main.scrollX = cameraOffset;
                const groundLayer = map.createLayer('ground_layer', tileset, 0, 0);

            }
        }

        const config = {
            type: Phaser.AUTO,
            width: 1080,
            height: 1920,
            parent: 'game-container',
            backgroundColor: '#2d2d2d',
            scene: LgRPG,
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH
            },
            physics: {
                default: 'arcade',
                arcade: { debug: false }
            }
        };
        new Phaser.Game(config);
    }
    catch (e) {
        console.error('Error loading configuration or initializing game:', e);
    }
}

startGame();



