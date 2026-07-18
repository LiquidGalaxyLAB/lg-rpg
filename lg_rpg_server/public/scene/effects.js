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

// Puffs fading speed-boost sparkles; `follow` anchors them to a sprite, `yOffset` lifts the burst.
export function sparkleBurst(scene, x, y, follow = null, count = 10, yOffset = 0) {
  if (!scene.onScreen(x)) return;
  for (let i = 0; i < count; i++) {
    const frame = Phaser.Math.Between(0, 7);
    const s = scene.add.sprite(x, y + yOffset, 'fx:sparkle', frame)
      .setDepth((follow ? follow.y : y) + 2)
      .setScale(Phaser.Math.FloatBetween(0.5, 0.95));
    const angle = Phaser.Math.DegToRad(Phaser.Math.Between(0, 359));
    const dist = Phaser.Math.Between(8, 40);
    const ox = Math.cos(angle) * dist, oy = Math.sin(angle) * dist - 6;
    const lifeMs = Phaser.Math.Between(300, 620);
    const spin = Phaser.Math.FloatBetween(-2, 2);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: lifeMs,
      onUpdate: (tween) => {
        const t = tween.getValue();
        s.x = (follow ? follow.x : x) + ox * t;
        s.y = (follow ? follow.y : y) + yOffset + oy * t;
        s.rotation = spin * t;
        s.setAlpha(1 - t);
      },
      onComplete: () => s.destroy(),
    });
  }
}

// Shield bubble on sprite.shieldFx; blinks as it expires, reflect (yellow) outranks shield (blue).
export function updateShieldFx(scene, sprite, entity, localX, visible) {
  const kind = entity.reflect ? 'reflect' : entity.shield ? 'shield' : null;
  const ending = kind === 'reflect' ? entity.reflectEnding : entity.shieldEnding;
  if (!kind || entity.dead || !visible) {
    if (sprite.shieldFx) { sprite.shieldFx.destroy(); sprite.shieldFx = null; sprite.shieldFxKind = null; }
    return;
  }
  // Body span from feet (entity.y) up to the sprite's top, so the bubble wraps the whole body.
  const bodyTop = sprite.cfg.bodyHeight != null
    ? sprite.cfg.bodyHeight * sprite.scaleY
    : sprite.displayHeight * sprite.originY;
  const centerY = entity.y - bodyTop / 2;
  // Rebuild the bubble when switching between reflect and plain shield.
  if (sprite.shieldFx && sprite.shieldFxKind !== kind) {
    sprite.shieldFx.destroy();
    sprite.shieldFx = null;
  }
  if (!sprite.shieldFx) {
    const tex = kind === 'reflect' ? 'fx:shield:reflect' : 'fx:shield';
    sprite.shieldFx = scene.add.sprite(localX, centerY, tex, 0).setOrigin(0.5);
    sprite.shieldFx.play(kind === 'reflect' ? 'fx:shield:reflect:spin' : 'fx:shield:spin');
    sprite.shieldFxKind = kind;
    const targetH = Math.max(bodyTop * 1.7, 60);
    sprite.shieldFx.setScale(targetH / sprite.shieldFx.height);
  }
  let alpha = 0.9;
  if (ending) alpha *= (Math.sin(scene.time.now / 80) > 0 ? 1 : 0.25);
  sprite.shieldFx.setPosition(localX, centerY).setDepth(entity.y + 3).setAlpha(alpha).setVisible(true);
}

// Ground aura on sprite.auraFx while 2× damage holds; pulses under the sprite, blinks as it ends.
export function updateAuraFx(scene, sprite, entity, localX, visible) {
  if (!entity.power || entity.dead || !visible) {
    if (sprite.auraFx) { sprite.auraFx.destroy(); sprite.auraFx = null; }
    return;
  }
  if (!sprite.auraFx) {
    sprite.auraFx = scene.add.sprite(localX, entity.y, 'fx:aura', 0).setOrigin(0.5, 0.7);
    sprite.auraFx.play('fx:aura:pulse');
    const targetW = Math.max(sprite.displayWidth * 0.72, 34);
    sprite.auraFx.setScale(targetW / sprite.auraFx.width);
  }
  let alpha = 0.9;
  if (entity.powerEnding) alpha *= (Math.sin(scene.time.now / 80) > 0 ? 1 : 0.25);
  sprite.auraFx.setPosition(localX, entity.y).setDepth(entity.y - 1).setAlpha(alpha).setVisible(true);
}
