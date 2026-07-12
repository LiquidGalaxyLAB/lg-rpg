// Particle/burst effects for the game scene: death bursts, shard sprays, and the heart heal popup. Each helper takes the Phaser scene as its first argument so this logic can live outside the scene class.

// Big shard burst + camera shake for a player death on this screen.
export function deathBurst(scene, x, y, color) {
  if (!scene.onScreen(x)) return;
  scene.cameras.main.shake(250, 0.008);
  // Spill the shards once the shake settles.
  scene.time.delayedCall(250, () => spillShards(scene, x, y, color));
}

// Sprays colored shards with gravity; count/speed/life scale it from hit spark to death burst; `follow` anchors the spray to a moving sprite.
export function spillShards(scene, x, y, color, { count = 24, minSpeed = 60, maxSpeed = 170, minLife = 400, maxLife = 800, follow = null } = {}) {
  if (!scene.onScreen(x)) return;
  const gravity = 400;
  for (let i = 0; i < count; i++) {
    const size = Phaser.Math.Between(2, 5);
    const shade = Array.isArray(color) ? color[Phaser.Math.Between(0, color.length - 1)] : color;
    const shard = scene.add.rectangle(x, y, size, size, shade).setDepth(y + 1);
    // Fan the shards upward and outward (200-340 degrees).
    const angle = Phaser.Math.DegToRad(Phaser.Math.Between(200, 340));
    const speed = Phaser.Math.Between(minSpeed, maxSpeed);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const lifeMs = Phaser.Math.Between(minLife, maxLife);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: lifeMs,
      onUpdate: (tween) => {
        const t = tween.getValue() * (lifeMs / 1000);
        shard.x = (follow ? follow.x : x) + vx * t;
        shard.y = (follow ? follow.y : y) + vy * t + 0.5 * gravity * t * t;
        shard.setAlpha(1 - tween.getValue());
      },
      onComplete: () => shard.destroy(),
    });
  }
}

// Pops a little cluster of green "+" icons that fan up and fade when the player picks up a heart, so the heal reads as a clear burst.
export function healPopup(scene, x, y) {
  if (!scene.onScreen(x)) return;
  const count = 6;
  for (let i = 0; i < count; i++) {
    const startY = y - Phaser.Math.Between(6, 34);
    const plus = scene.add.text(x, startY, '+', {
      fontFamily: 'monospace', fontSize: Phaser.Math.Between(15, 26) + 'px',
      color: '#5bffa0', fontStyle: 'bold', stroke: '#06301d', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100000);
    scene.tweens.add({
      targets: plus,
      x: x + Phaser.Math.Between(-28, 28),
      y: startY - Phaser.Math.Between(42, 80),
      alpha: 0,
      duration: Phaser.Math.Between(650, 1000),
      ease: 'Cubic.Out',
      onComplete: () => plus.destroy(),
    });
  }
}
