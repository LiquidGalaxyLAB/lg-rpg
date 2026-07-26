// In-map leaderboard panel, framed by the one rectangle in the map's `leaderboard` object layer; maps without it get no panel.
import { GAME_VIEW } from '../shared_constants.js';

const REFRESH_MS = 250;
const PAD = 8;
// Widest row the formatter emits ("1 B Playername__ DOWN 999k"); rowSize is measured against it so nothing overflows.
const ROW_CHARS = 26;
const NAME_CHARS = 12;

const formatClock = (ms) => {
  const s = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Builds the panel background and text objects once, if this screen owns the box.
export function createLeaderboard(scene, map, configData) {
  const box = map.getObjectLayer('leaderboard')?.objects?.find((o) => o.width > 0 && o.height > 0);
  if (!box) return;
  const x = box.x - scene.cameraOffset;
  // Claimed by the screen holding the box's centre; plain overlap made a straddling box draw a full, clipped copy on both screens.
  const centreX = x + box.width / 2;
  if (centreX < 0 || centreX >= GAME_VIEW.screenWidth) return;

  // Depth sits above the waiting overlay, but updateLeaderboard hides the panel while that overlay is up.
  const g = scene.add.graphics().setDepth(9500);
  g.fillStyle(0x2b2d3b, 0.95).fillRoundedRect(x, box.y, box.width, box.height, 6);
  g.lineStyle(1, 0x494c65, 1).strokeRoundedRect(x, box.y, box.width, box.height, 6);

  // Derived from the box so the panel fills whatever rectangle the map author drew, one row slot per lobby seat.
  const w = box.width, h = box.height;
  const slots = configData.maxPlayers || 4;
  const titleSize = Math.max(12, Math.round(h * 0.08));
  const subSize = Math.max(9, Math.round(h * 0.055));
  const rowsTop = PAD + titleSize + 4 + subSize + 6;
  const rowH = (h - rowsTop - PAD) / slots;
  // Row font is capped by both the slot height and the ROW_CHARS line width.
  const rowSize = Math.max(9, Math.floor(Math.min(rowH * 0.5, (w - 2 * PAD) / (ROW_CHARS * 0.62))));

  // 3x resolution so the display upscale keeps text sharp.
  const mkText = (tx, ty, size, color, style = {}) => scene.add.text(x + tx, box.y + ty, '', {
    fontFamily: 'monospace', fontSize: `${size}px`, color, ...style,
  }).setDepth(9501).setResolution(3);

  scene.leaderboard = {
    lastRefresh: -Infinity,
    isPvp: configData.selectedMode === 'pvp',
    slots,
    announcement: null,
    announcementUntil: 0,
    panel: g,
    visible: true,
    title: mkText(PAD, PAD, titleSize, '#ddde68').setText('LEADERBOARD'),
    clock: mkText(w - PAD, PAD, titleSize, '#ffffff').setOrigin(1, 0),
    sub: mkText(PAD, PAD + titleSize + 4, subSize, '#a5b2eb'),
    rows: mkText(PAD, rowsTop, rowSize, '#eaecf5', {
      lineSpacing: Math.max(2, rowH - rowSize * 1.2),
    }),
  };
}

// Match clock / result line for the panel header.
function clockInfo(scene) {
  const final = scene.serverFinal;
  if (final) {
    if ('winner' in final) {
      const s = final.scores || {};
      const label = final.winner ? (final.winner === 'teamA' ? 'BLUE WINS' : 'RED WINS') : 'DRAW';
      return { label, sub: `Blue ${s.teamA ?? 0} - ${s.teamB ?? 0} Red` };
    }
    return {
      label: final.outcome === 'win' ? 'VICTORY' : 'GAME OVER',
      sub: `Survived ${formatClock(final.survivedMs)}`,
    };
  }
  const pvp = scene.serverPvp;
  if (pvp) {
    const s = pvp.scores || {};
    return { label: formatClock(pvp.roundRemainingMs), sub: `Blue ${s.teamA ?? 0} - ${s.teamB ?? 0} Red` };
  }
  const m = scene.serverMatch;
  if (!m) return { label: `${scene.serverPlayers.length}/${scene.leaderboard.slots}`, sub: 'Waiting for players…' };
  const inWarmup = m.warmupMs > 0 && m.elapsedMs < m.warmupMs;
  // Past the survive mark the dragon boss is loose: show its health instead of a clock.
  if (!inWarmup && m.durationMs > 0 && m.elapsedMs >= m.durationMs) {
    const boss = scene.serverEnemies.find((e) => e.type === 'dragon');
    const pct = boss ? Math.max(0, Math.round((boss.hp / (boss.maxHp || 1)) * 100)) : null;
    return { label: pct === null ? 'BOSS' : `BOSS ${pct}%`, sub: 'Slay the dragon!' };
  }
  return {
    label: formatClock((inWarmup ? m.warmupMs : m.durationMs) - m.elapsedMs),
    sub: inWarmup ? 'Enemies incoming' : 'Survive',
  };
}

// By team (leading first) in PvP, by kills otherwise.
function ranked(scene, isPvp) {
  const list = [...(scene.serverFinal?.results || scene.serverPlayers)];
  const byKillsThenName = (a, b) =>
    Number(b.kills || 0) - Number(a.kills || 0) || String(a.name || '').localeCompare(String(b.name || ''));
  if (!isPvp) return list.sort(byKillsThenName);
  const s = scene.serverFinal?.scores || scene.serverPvp?.scores || {};
  const teamOrder = (s.teamA || 0) >= (s.teamB || 0) ? { teamA: 0, teamB: 1 } : { teamA: 1, teamB: 0 };
  return list.sort((a, b) => (teamOrder[a.team] ?? 2) - (teamOrder[b.team] ?? 2) || byKillsThenName(a, b));
}

// Refreshes the panel text a few times a second.
export function updateLeaderboard(scene) {
  const lb = scene.leaderboard;
  if (!lb) return;

  // Hidden during the lobby rather than layered over the waiting overlay; checked every frame, not on the throttle.
  const wantVisible = !scene.waitingObjects?.length;
  if (wantVisible !== lb.visible) {
    lb.visible = wantVisible;
    for (const obj of [lb.panel, lb.title, lb.clock, lb.sub, lb.rows]) obj.setVisible(wantVisible);
  }
  if (!wantVisible) return;

  if (scene.time.now - lb.lastRefresh < REFRESH_MS) return;
  lb.lastRefresh = scene.time.now;

  const isPvp = lb.isPvp || !!scene.serverPvp || (!!scene.serverFinal && 'winner' in scene.serverFinal);
  const { label, sub } = clockInfo(scene);
  lb.clock.setText(label);
  if (lb.announcement && scene.time.now >= lb.announcementUntil) lb.announcement = null;
  lb.sub.setText(lb.announcement || sub);

  const players = ranked(scene, isPvp);
  // Filled and empty seats build every column the same way, so an unclaimed slot can't shift left by the width of the PvP team tag.
  const row = (rank, team, name, state, kills) =>
    `${rank} ${team}${name.padEnd(NAME_CHARS)} ${state.padStart(4)} ${kills.padStart(3)}`;

  lb.rows.setText(Array.from({ length: lb.slots }, (_, i) => {
    const p = players[i];
    const blankTeam = isPvp ? '  ' : '';
    if (!p) return `${row(i + 1, blankTeam, '—', '—', '—')} `;
    const hp = Number(p.hp), max = Number(p.maxHp || 0);
    const known = Number.isFinite(hp) && max > 0;
    const pct = known ? Math.max(0, Math.min(100, Math.round((hp / max) * 100))) : null;
    // Without health in the payload, show a dash rather than inventing full HP.
    const state = p.dead ? 'DOWN' : known ? `${pct}%` : '—';
    const team = isPvp ? (p.team === 'teamA' ? 'B ' : p.team === 'teamB' ? 'R ' : '  ') : '';
    const name = String(p.name || `Player ${i + 1}`).slice(0, NAME_CHARS);
    // Clamped so a runaway count can't widen the row past what rowSize was measured against.
    const kills = String(Math.min(999, Number(p.kills) || 0));
    return `${row(i + 1, team, name, state, kills)}k`;
  }).join('\n'));
}

// Short-lived server announcements in the sub-line; the map screens are the rig's only display, so these can't live on the right screen alone.
export function setLeaderboardAnnouncement(scene, message, durationMs = 3500) {
  const lb = scene.leaderboard;
  if (!lb || !message) return;
  lb.announcement = String(message);
  lb.announcementUntil = scene.time.now + durationMs;
  lb.lastRefresh = -Infinity; // show it on the next frame rather than up to REFRESH_MS later
}
