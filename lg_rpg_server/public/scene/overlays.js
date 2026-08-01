// Overlay rendering for the game scene. Each helper takes the Phaser scene as its first argument, so this can live outside the (large) scene class.
import { GAME_VIEW } from '../shared_constants.js';

// Capture zones, team spawn boxes, and the team marker under each player.
export function drawPvp(scene) {
  const g = scene.pvpGraphics.clear();
  const pvp = scene.serverPvp;
  if (!pvp) return;
  const off = scene.cameraOffset, W = GAME_VIEW.screenWidth;
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
  for (const p of scene.serverPlayers) {
    if (!p.team) continue;
    const lx = p.x - off;
    if (lx < -40 || lx > W + 40) continue;
    g.fillStyle(teamColor(p.team), p.dead ? 0.25 : 0.9);
    g.fillCircle(lx, p.y - 2, 7);
  }
}

// Syncs the animated heart pickup sprites with server state.
export function drawHearts(scene) {
  const activeIds = new Set();
  for (const heart of scene.serverHearts) {
    activeIds.add(heart.id);
    const localX = heart.x - scene.cameraOffset;
    let sprite = scene.heartSprites.get(heart.id);
    if (!sprite) {
      sprite = scene.add.sprite(localX, heart.y, 'heart', 0).setOrigin(0.5).setScale(2).setDepth(1);
      sprite.play('heart:pulse');
      scene.heartSprites.set(heart.id, sprite);
    }
    sprite.setPosition(localX, heart.y);
    sprite.setVisible(localX > -40 && localX < GAME_VIEW.screenWidth + 40);
  }
  for (const [id, sprite] of scene.heartSprites) {
    if (!activeIds.has(id)) {
      sprite.destroy();
      scene.heartSprites.delete(id);
    }
  }
}

const SCALE_RESIZE = 'resize';

function viewportReport(scene) {
  const screenNumber = parseInt(new URLSearchParams(location.search).get('screen')) || 1;
  const vw = window.innerWidth, vh = window.innerHeight;
  const display = scene.scale.displaySize;
  const cw = Math.round(display.width), ch = Math.round(display.height);
  const sideBar = Math.round((vw - cw) / 2), topBar = Math.round((vh - ch) / 2);
  const fills = sideBar <= 1 && topBar <= 1;
  const verdict = fills ? 'FILLS PANEL'
    : sideBar >= topBar ? `BARS ${sideBar}px EACH SIDE` : `BARS ${topBar}px TOP AND BOTTOM`;
  return {
    fills,
    text: [
      `screen ${screenNumber}`,
      `panel     ${window.screen.width} x ${window.screen.height}`,
      `viewport  ${vw} x ${vh}`,
      `canvas    ${cw} x ${ch}`,
      // Page zoom and OS display scaling both land here; the launcher forces 1.
      `dpr       ${window.devicePixelRatio}`,
      verdict,
    ].join('\n'),
  };
}

export function showWaiting(scene) {
  if (scene.waitingObjects?.length) return;
  const w = GAME_VIEW.screenWidth, h = GAME_VIEW.screenHeight;
  // TEMPORARY: the diagnostic block, refreshed on resize so it stays true if the window changes.
  const report = scene.add.text(w / 2, h / 2 + 12, '', {
    fontFamily: 'monospace', fontSize: '10px', color: '#ffca28', align: 'center'
  }).setOrigin(0.5, 0).setDepth(9001).setResolution(3);
  scene.waitingReport = () => {
    const { fills, text } = viewportReport(scene);
    report.setText(text).setColor(fills ? '#5fd18c' : '#ffca28');
  };
  scene.waitingReport();
  scene.scale.on(SCALE_RESIZE, scene.waitingReport);

  scene.waitingObjects = [
    scene.add.rectangle(w / 2, h / 2, w, h, 0x1a1a1a, 1).setDepth(9000),
    scene.add.text(w / 2, h / 2, 'Waiting for the match to start…', {
      fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', align: 'center', wordWrap: { width: w * 0.8 }
    }).setOrigin(0.5, 1).setDepth(9001).setResolution(3),
    report,
  ];
  scene.waitingObjects.forEach(obj => obj.setAlpha(0));
  scene.tweens.add({ targets: scene.waitingObjects, alpha: 1, duration: 500, ease: 'Sine.easeOut' });
}

export function hideWaiting(scene) {
  const objects = scene.waitingObjects || [];
  if (!objects.length) return;
  scene.waitingObjects = [];
  // TEMPORARY: drop the diagnostic's resize listener with the text it updates.
  if (scene.waitingReport) {
    scene.scale.off(SCALE_RESIZE, scene.waitingReport);
    scene.waitingReport = null;
  }
  scene.tweens.add({
    targets: objects, alpha: 0, duration: 500, ease: 'Sine.easeIn',
    onComplete: () => objects.forEach(obj => obj.destroy()),
  });
}
