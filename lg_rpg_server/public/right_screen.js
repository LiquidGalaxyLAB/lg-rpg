// Client-side script for the right screen (leaderboard, commentary, and match timer display).
import { SOCKET_EVENTS } from './shared_constants.js';
import { initGameAudio } from './game_audio.js';

const socket = io();
const audio = initGameAudio(socket);
const $ = (id) => document.getElementById(id);

const state = { connected: false, modeLabel: 'Zombie Raid', players: [], match: null, pvp: null, final: null, announcement: null, boss: null };

const teamName = (t) => (t === 'teamA' ? 'Blue' : t === 'teamB' ? 'Red' : '—');

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatClock = (ms) => `${Math.floor(Math.max(0, Math.ceil(Number(ms || 0) / 1000)) / 60)}:${String(Math.max(0, Math.ceil(Number(ms || 0) / 1000)) % 60).padStart(2, '0')}`;
const titleCase = (mode) => String(mode || 'Zombie Raid').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// PvP ranks rows by team (leading team first); kills only break ties within a team.
const ranked = (isPvp) => {
  const list = [...(state.final?.results || state.players)];
  const byKillsThenName = (a, b) => Number(b.kills || 0) - Number(a.kills || 0) || String(a.name || '').localeCompare(String(b.name || ''));
  if (!isPvp) return list.sort(byKillsThenName);
  const s = state.final?.scores || state.pvp?.scores || {};
  const teamOrder = (s.teamA || 0) >= (s.teamB || 0) ? { teamA: 0, teamB: 1 } : { teamA: 1, teamB: 0 };
  return list.sort((a, b) => (teamOrder[a.team] ?? 2) - (teamOrder[b.team] ?? 2) || byKillsThenName(a, b));
};

function renderStatus() {
  $('modeLabel').textContent = state.modeLabel;
  if ($('dot')) $('dot').classList.toggle('live', state.connected);
  if ($('statusText')) $('statusText').textContent = state.connected ? 'Online' : 'Offline';
}

// The match timer, or the game-over result once the match ends.
function renderResult() {
  const panel = $('result');
  panel.classList.remove('win', 'lose', 'draw');
  if (state.final) {
    // PvP result carries a winning team; co-op result carries an outcome.
    if ('winner' in state.final) {
      const w = state.final.winner, s = state.final.scores || {};
      panel.classList.add(w ? 'win' : 'draw');
      $('clockLabel').textContent = w ? `${teamName(w)} Team Wins` : 'Draw';
      $('clockValue').textContent = w ? 'VICTORY' : 'DRAW';
      $('resultSub').textContent = `Blue ${s.teamA ?? 0} — ${s.teamB ?? 0} Red`;
      return;
    }
    const won = state.final.outcome === 'win';
    panel.classList.add(won ? 'win' : 'lose');
    $('clockLabel').textContent = won
      ? (state.final.reason === 'boss-defeated' ? 'Dragon Slain' : 'Squad Survived')
      : 'Defeated';
    $('clockValue').textContent = won ? 'VICTORY' : 'GAME OVER';
    $('resultSub').textContent = `Survived ${formatClock(state.final.survivedMs)}`;
    return;
  }
  $('resultSub').textContent = '';
  if (state.pvp) {
    const p = state.pvp, s = p.scores || {};
    $('clockLabel').textContent = 'Zone Battle';
    $('clockValue').textContent = formatClock(p.roundRemainingMs);
    $('resultSub').textContent = `Blue ${s.teamA ?? 0} — ${s.teamB ?? 0} Red`;
    return;
  }
  if (!state.match) {
    // Lobby / waiting state: show the roster fill instead of a dead 0:00 clock.
    const n = state.players.length;
    $('clockLabel').textContent = n === 0 ? 'Waiting for Players' : 'Lobby';
    $('clockValue').textContent = `${n}/4`;
    $('resultSub').textContent = n === 0
      ? 'Join on your phone to enter the raid'
      : 'Waiting for the host to start…';
    return;
  }
  const { elapsedMs = 0, warmupMs = 0, durationMs = 0 } = state.match;
  const inWarmup = warmupMs > 0 && elapsedMs < warmupMs;
  // Past the survive mark the boss is loose, so the countdown becomes its health readout.
  if (!inWarmup && durationMs > 0 && elapsedMs >= durationMs) {
    $('clockLabel').textContent = 'Slay the Dragon';
    if (state.boss) {
      const pct = Math.max(0, Math.min(100, Math.round((state.boss.hp / (state.boss.maxHp || 1)) * 100)));
      $('clockValue').textContent = `${pct}%`;
      $('resultSub').textContent = 'Boss HP — kill it to win!';
    } else {
      $('clockValue').textContent = 'BOSS';
      $('resultSub').textContent = 'The dragon approaches…';
    }
    return;
  }
  $('clockLabel').textContent = inWarmup ? 'Enemies In' : 'Survive';
  $('clockValue').textContent = formatClock((inWarmup ? warmupMs : durationMs) - elapsedMs);
}

function renderBoard() {
  const isPvp = !!state.pvp || (!!state.final && 'winner' in state.final);
  const rows = ranked(isPvp);
  if ($('count')) $('count').textContent = `${rows.length}/4 Players`;
  if (rows.length === 0) {
    $('rows').innerHTML = `<div class="empty-message">${escapeHtml(state.announcement || 'Waiting for players...')}</div>`;
    return;
  }
  // Announcements were only visible on an empty board; show them above the rows too.
  const banner = state.announcement ? `<div class="empty-message">${escapeHtml(state.announcement)}</div>` : '';
  $('rows').innerHTML = banner + rows.map((p, i) => {
    const hp = Number(p.hp), max = Number(p.maxHp || 0);
    // Without health in the payload the bar stays empty and reads "Ready", rather than inventing a full green bar.
    const known = Number.isFinite(hp) && max > 0;
    const pct = known ? Math.max(0, Math.min(100, Math.round(hp / max * 100))) : 0;
    const label = p.dead ? 'Down' : known ? `${pct}% HP` : 'Ready';
    const cls = p.dead ? 'hp-dead' : !known ? 'hp-healthy' : pct <= 30 ? 'hp-critical' : pct < 100 ? 'hp-hurt' : 'hp-healthy';
    const teamCls = p.team === 'teamA' ? 'team-a' : p.team === 'teamB' ? 'team-b' : '';
    const teamTag = isPvp && teamCls ? `<span class="team-tag ${teamCls}">${escapeHtml(teamName(p.team))}</span>` : '';
    // The kill-count highlight only makes sense outside PvP, where kills are the actual ranking metric.
    return `<article class="row${!isPvp && i === 0 ? ' lead' : ''}${state.final ? ' final' : ''} ${cls} ${teamCls}">
      <div class="rank">${i + 1}</div>
      <div class="player-main">
        <p class="name">${teamTag}${escapeHtml(p.name || `Player ${i + 1}`)}</p>
        <div class="hp-track"><div class="hp-fill" style="--hp:${pct}%"></div></div>
        <div class="pstate">${escapeHtml(label)}</div>
      </div>
      <div class="kills"><b>${Number(p.kills || 0)}</b><span>Kills</span></div>
    </article>`;
  }).join('');
}

function render() { renderStatus(); renderResult(); renderBoard(); }

function showAnnouncement(message, durationMs = 3500) {
  state.announcement = message;
  render();
  clearTimeout(showAnnouncement.timer);
  showAnnouncement.timer = setTimeout(() => { state.announcement = null; render(); }, durationMs);
}

// Music and commentary playback is handled by the shared game_audio module, not here.
socket.on('connect', () => { state.connected = true; renderStatus(); });
socket.on('disconnect', () => { state.connected = false; renderStatus(); });
socket.on(SOCKET_EVENTS.UPDATE_LOBBY, (p = {}) => { if (!state.match && !state.final) { state.players = p.players || []; if (p.selectedMode) state.modeLabel = titleCase(p.selectedMode); render(); } });
socket.on(SOCKET_EVENTS.GAME_STARTED, (p = {}) => { state.final = null; state.pvp = null; state.modeLabel = titleCase(p.selectedMode || state.modeLabel); render(); });
socket.on(SOCKET_EVENTS.GAME_STATE, (p = {}) => { state.players = p.players || []; state.match = p.match || null; state.pvp = p.pvp || null; state.boss = (p.enemies || []).find((e) => e.type === 'dragon') || null; render(); });
socket.on(SOCKET_EVENTS.GAME_OVER, (p = {}) => { state.final = p; state.match = null; state.pvp = null; render(); });
socket.on(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, (p = {}) => p.message && showAnnouncement(p.message, p.durationMs));

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const config = await res.json();
    state.modeLabel = config.selectedModeLabel || titleCase(config.selectedMode);
    audio.setMode(config.selectedMode);
    renderStatus();
  } catch (_) {}
}

loadConfig();
render();
setInterval(renderResult, 250);
