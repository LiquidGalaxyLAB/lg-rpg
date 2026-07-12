// Zombie-mode rain, simulated in each screen's local coordinates (rain is uniform, so screens don't need to share one simulation). Each helper takes the Phaser scene as its first argument so this logic can live outside the scene class.
import { GAME_VIEW } from '../shared_constants.js';

// Creates the rain: falling drops plus pulsing floor splashes.
export function createWeather(scene) {
  const w = GAME_VIEW.screenWidth, h = GAME_VIEW.screenHeight;
  scene.rainDrops = [];
  scene.rainSplashes = [];

  const dropCount = Math.round((w * h) / 3600);
  for (let i = 0; i < dropCount; i++) {
    const drop = scene.add.image(
      Phaser.Math.Between(-80, w + 80), Phaser.Math.Between(-160, h + 80),
      'rain', Phaser.Math.Between(0, 2)
    );
    drop.setDepth(5000); // above sprites (depth = y), below the waiting overlay (9000)
    drop.setScale(Phaser.Math.FloatBetween(1.0, 1.8));
    drop.setAlpha(Phaser.Math.FloatBetween(0.26, 0.62));
    drop.speed = Phaser.Math.FloatBetween(260, 520);
    drop.wind = Phaser.Math.FloatBetween(-95, -45);
    scene.rainDrops.push(drop);
  }

  const splashCount = Math.round((w * h) / 15000);
  for (let i = 0; i < splashCount; i++) {
    const splash = scene.add.image(
      Phaser.Math.Between(0, w), Phaser.Math.Between(0, h),
      'rain-floor', Phaser.Math.Between(0, 2)
    );
    splash.setDepth(5000);
    splash.setScale(Phaser.Math.FloatBetween(1.1, 1.7));
    splash.setAlpha(Phaser.Math.FloatBetween(0.10, 0.32));
    splash.life = Phaser.Math.FloatBetween(0, 1);
    scene.rainSplashes.push(splash);
  }
}

// Advances rain drops and recycles them once they leave this screen's slice.
export function updateWeather(scene, dt) {
  const w = GAME_VIEW.screenWidth, h = GAME_VIEW.screenHeight;
  for (const drop of scene.rainDrops) {
    drop.x += drop.wind * dt;
    drop.y += drop.speed * dt;
    if (drop.y > h + 24 || drop.x < -120) {
      drop.x = Phaser.Math.Between(0, w + 120);
      drop.y = Phaser.Math.Between(-140, -10);
    }
  }
  for (const splash of scene.rainSplashes) {
    splash.life += dt * 1.8;
    splash.alpha = 0.1 + Math.abs(Math.sin(splash.life * Math.PI)) * 0.35;
    if (splash.life > 1) {
      splash.life = 0;
      splash.x = Phaser.Math.Between(0, w);
      splash.y = Phaser.Math.Between(0, h);
    }
  }
}
