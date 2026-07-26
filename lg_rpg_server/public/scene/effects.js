// Particle/burst effects for the game scene. Each helper takes the Phaser scene as its first argument, so this can live outside the scene class.

// Big shard burst + camera shake for a player death on this screen.
export function deathBurst(scene, x, y, color) {
  if (!scene.onScreen(x)) return;
  scene.cameras.main.shake(250, 0.008);
  scene.time.delayedCall(250, () => spillShards(scene, x, y, color));
}

// Colored shards under gravity; count/speed/life scale it from hit spark to death burst, and `follow` anchors the spray to a moving sprite.
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

// A cluster of green "+" icons that fan up and fade, so a heal reads as a clear burst.
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

// Attack FX keyed by `actionKind`. `tint` recolours the white sheets only (Phaser tint multiplies, so cyan can't go violet); `ring` uses fixed angles so every screen matches; `ringRadius` stays inside the real damage radius.
const ATTACK_FX = {
  // The 500ms swing anim outlasts its own 350ms cooldown, so `replace` retires the previous sprite instead of piling them up.
  melee: { key: 'fx:swing', scale: 1.0, replace: true },
  // Staggered to the server's pulse intervals so each spawn lands with a damage tick.
  tide: { key: 'fx:tide', scale: 1.3, ring: 3, ringRadius: 30, repeatMs: 180 },
  riptide: { key: 'fx:riptide', scale: 1.2 },
  frost: { key: 'fx:frost', scale: 1.6, ring: 3, ringRadius: 66, repeatMs: 120 },
  blessing: { key: 'fx:blessing', scale: 1.4, tint: 0xffc53d },
};

// One-shot FX above the caster; a no-op for kinds without art (the huntress's projectiles carry their own). `owner` is the caster's sprite, used to retire a `replace` FX.
export function playAttackFx(scene, kind, x, y, owner = null) {
  const fx = ATTACK_FX[kind];
  if (!fx || !scene.onScreen(x)) return;

  if (fx.replace && owner?.attackFx) {
    owner.attackFx.destroy();
    owner.attackFx = null;
  }

  const spawn = (ox, oy) => {
    const s = scene.add.sprite(x + ox, y + oy, fx.key, 0)
      .setOrigin(0.5, 0.6)
      .setScale(fx.scale)
      // Above the sprites (which use depth = world y) but below the projectile blasts at 100000.
      .setDepth(y + 5);
    if (fx.tint) s.setTint(fx.tint);
    s.play(`${fx.key}:play`);
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (owner?.attackFx === s) owner.attackFx = null;
      s.destroy();
    });
    if (fx.replace && owner) owner.attackFx = s;
  };

  if (fx.ring) {
    for (let i = 0; i < fx.ring; i++) {
      const angle = (Math.PI * 2 * i) / fx.ring;
      // Squashed on y so the ring reads as lying on the ground rather than facing the camera.
      const ox = Math.cos(angle) * fx.ringRadius;
      const oy = Math.sin(angle) * fx.ringRadius * 0.6;
      if (i === 0 || !fx.repeatMs) spawn(ox, oy);
      else scene.time.delayedCall(i * fx.repeatMs, () => spawn(ox, oy));
    }
    return;
  }
  spawn(0, 0);
}

// Shield bubble on sprite.shieldFx; blinks as it expires, reflect (yellow) outranks shield (blue).
export function updateShieldFx(scene, sprite, entity, localX, visible) {
  const kind = entity.reflect ? 'reflect' : entity.shield ? 'shield' : null;
  const ending = kind === 'reflect' ? entity.reflectEnding : entity.shieldEnding;
  if (!kind || entity.dead || !visible) {
    if (sprite.shieldFx) { sprite.shieldFx.destroy(); sprite.shieldFx = null; sprite.shieldFxKind = null; }
    return;
  }
  // Feet (entity.y) to the sprite's top, so the bubble wraps the whole body.
  const bodyTop = sprite.cfg.bodyHeight != null
    ? sprite.cfg.bodyHeight * sprite.scaleY
    : sprite.displayHeight * sprite.originY;
  const centerY = entity.y - bodyTop / 2;
  // Rebuilt when switching between reflect and plain shield.
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

    const bodyTop = sprite.cfg.bodyHeight != null
      ? sprite.cfg.bodyHeight * sprite.scaleY
      : sprite.displayHeight * sprite.originY;
    const targetW = Math.max(bodyTop * 1.3, 30);
    sprite.auraFx.setScale(targetW / sprite.auraFx.width);
  }
  let alpha = 0.9;
  if (entity.powerEnding) alpha *= (Math.sin(scene.time.now / 80) > 0 ? 1 : 0.25);
  sprite.auraFx.setPosition(localX, entity.y).setDepth(entity.y - 1).setAlpha(alpha).setVisible(true);
}
