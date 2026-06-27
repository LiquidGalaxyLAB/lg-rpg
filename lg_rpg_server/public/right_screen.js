// Client-side script for the right screen (leaderboard, commentary, and match timer display).
import { SOCKET_EVENTS } from './shared_constants.js';

const socket = io();
const $ = (id) => document.getElementById(id);

const state = { connected: false, modeLabel: 'Zombie Raid', players: [], match: null, pvp: null, final: null };

// Maps a PvP team id to its display colour name.
const teamName = (t) => (t === 'teamA' ? 'Blue' : t === 'teamB' ? 'Red' : '—');

// Utility helpers to escape HTML, format the match clock, and rank players by kills.
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatClock = (ms) => `${Math.floor(Math.max(0, Math.ceil(Number(ms || 0) / 1000)) / 60)}:${String(Math.max(0, Math.ceil(Number(ms || 0) / 1000)) % 60).padStart(2, '0')}`;
const titleCase = (mode) => String(mode || 'Zombie Raid').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const ranked = () => [...(state.final?.results || state.players)].sort((a, b) => Number(b.kills || 0) - Number(a.kills || 0) || String(a.name || '').localeCompare(String(b.name || '')));

// Renders the server connection status indicator.
function renderStatus() {
  $('modeLabel').textContent = state.modeLabel;
  if ($('dot')) $('dot').classList.toggle('live', state.connected);
  if ($('statusText')) $('statusText').textContent = state.connected ? 'Online' : 'Offline';
}

// Renders the match timer or game over results.
function renderResult() {
  const panel = $('result');
  panel.classList.remove('win', 'lose');
  if (state.final) {
    // PvP result carries a winning team; co-op result carries an outcome.
    if ('winner' in state.final) {
      const w = state.final.winner, s = state.final.scores || {};
      panel.classList.add(w ? 'win' : 'lose');
      $('clockLabel').textContent = w ? `${teamName(w)} Team Wins` : 'Draw';
      $('clockValue').textContent = w ? 'VICTORY' : 'DRAW';
      $('resultSub').textContent = `Blue ${s.teamA ?? 0} — ${s.teamB ?? 0} Red`;
      return;
    }
    const won = state.final.outcome === 'win';
    panel.classList.add(won ? 'win' : 'lose');
    $('clockLabel').textContent = won ? 'Squad Survived' : 'Defeated';
    $('clockValue').textContent = won ? 'VICTORY' : 'GAME OVER';
    $('resultSub').textContent = `Survived ${formatClock(state.final.survivedMs)}`;
    return;
  }
  $('resultSub').textContent = '';
  if (state.pvp) {
    const p = state.pvp, lock = p.phase === 'lock', s = p.scores || {};
    $('clockLabel').textContent = lock ? 'Locked In' : 'Zone Battle';
    $('clockValue').textContent = formatClock(lock ? p.lockRemainingMs : p.roundRemainingMs);
    $('resultSub').textContent = `Blue ${s.teamA ?? 0} — ${s.teamB ?? 0} Red`;
    return;
  }
  if (!state.match) {
    $('clockLabel').textContent = 'Waiting';
    $('clockValue').textContent = '0:00';
    return;
  }
  const { elapsedMs = 0, warmupMs = 0, durationMs = 0 } = state.match;
  const inWarmup = warmupMs > 0 && elapsedMs < warmupMs;
  $('clockLabel').textContent = inWarmup ? 'Enemies In' : 'Survive';
  $('clockValue').textContent = formatClock((inWarmup ? warmupMs : durationMs) - elapsedMs);
}

// Renders the leaderboard sorted by player kills.
function renderBoard() {
  const rows = ranked();
  if ($('count')) $('count').textContent = `${rows.length}/4 Players`;
  if (rows.length === 0) {
    $('rows').innerHTML = `<div class="empty-message">Waiting for players...</div>`;
    return;
  }
  $('rows').innerHTML = rows.map((p, i) => {
    const hp = Number(p.hp), max = Number(p.maxHp || 100);
    const pct = Number.isFinite(hp) && max > 0 ? Math.max(0, Math.min(100, Math.round(hp / max * 100))) : 100;
    const label = p.dead ? 'Down' : Number.isFinite(hp) ? `${pct}% HP` : 'Ready';
    const cls = p.dead ? 'hp-dead' : pct <= 30 ? 'hp-critical' : pct < 100 ? 'hp-hurt' : 'hp-healthy';
    return `<article class="row${i === 0 ? ' lead' : ''}${state.final ? ' final' : ''} ${cls}">
      <div class="rank">${i + 1}</div>
      <div class="player-main">
        <p class="name">${escapeHtml(p.name || `Player ${i + 1}`)}</p>
        <div class="hp-track"><div class="hp-fill" style="--hp:${pct}%"></div></div>
        <div class="pstate">${escapeHtml(label)}</div>
      </div>
      <div class="kills"><b>${Number(p.kills || 0)}</b><span>Kills</span></div>
    </article>`;
  }).join('');
}

// Updates the entire UI rendering.
function render() { renderStatus(); renderResult(); renderBoard(); }

// Displays temporary banner notifications at the top of the screen.
function showBanner(message, durationMs = 3500) {
  $('banner').textContent = message;
  $('banner').classList.add('show');
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => $('banner').classList.remove('show'), durationMs);
}

const speechQueue = [];
let speaking = false, currentAudio = null, speechGeneration = 0;

window.addEventListener('pointerdown', playNextLine);
window.addEventListener('keydown', playNextLine);

// Clears the commentary queue and stops any playing audio.
function stopCommentary() {
  speechGeneration++;
  speechQueue.length = 0;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  speaking = false;
}

// Plays the next commentary voice clip in the queue.
function playNextLine() {
  if (speaking) return;
  const next = speechQueue[0];
  if (!next) return;
  if (!next.line || !next.audio) { speechQueue.shift(); playNextLine(); return; }
  speaking = true;
  const gen = speechGeneration;
  const audio = new Audio('data:audio/mpeg;base64,' + next.audio);
  currentAudio = audio;
  const advance = () => {
    if (gen !== speechGeneration) return;
    if (speechQueue[0] === next) speechQueue.shift();
    currentAudio = null;
    speaking = false;
    playNextLine();
  };
  audio.onplay = () => gen === speechGeneration && next.line && socket.emit(SOCKET_EVENTS.CHEERLEADER_SPOKEN, { speaker: next.speaker, line: next.line });
  audio.onended = audio.onerror = advance;
  audio.play().catch(advance);
}

// Listen for server socket events to update players, game state, and commentary audio.
socket.on('connect', () => { state.connected = true; socket.emit(SOCKET_EVENTS.REGISTER_CHEERLEADER_SCREEN); renderStatus(); });
socket.on('disconnect', () => { state.connected = false; stopCommentary(); renderStatus(); });
socket.on(SOCKET_EVENTS.UPDATE_LOBBY, (p = {}) => { if (!state.match && !state.final) { state.players = p.players || []; render(); } });
socket.on(SOCKET_EVENTS.GAME_STARTED, (p = {}) => { stopCommentary(); state.final = null; state.pvp = null; state.modeLabel = titleCase(p.selectedMode || state.modeLabel); render(); });
socket.on(SOCKET_EVENTS.GAME_STATE, (p = {}) => { state.players = p.players || []; state.match = p.match || null; state.pvp = p.pvp || null; render(); });
socket.on(SOCKET_EVENTS.GAME_OVER, (p = {}) => { state.final = p; state.match = null; state.pvp = null; render(); });
socket.on(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, (p = {}) => p.message && showBanner(p.message, p.durationMs));
socket.on(SOCKET_EVENTS.CHEERLEADER_AUDIO, (p = {}) => {
  if (!p.line) return;
  speechQueue.push(p);
  const first = speaking ? 1 : 0;
  while (speechQueue.length - first > 2) speechQueue.splice(first, 1);
  playNextLine();
});

// Loads initial server configurations.
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const config = await res.json();
    state.modeLabel = config.selectedModeLabel || titleCase(config.selectedMode);
    renderStatus();
  } catch (_) {}
}

loadConfig();
render();
setInterval(renderResult, 250);
