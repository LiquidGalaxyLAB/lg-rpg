// Client-side script for the right screen (leaderboard, commentary, and match timer display).
import { SOCKET_EVENTS } from './shared_constants.js';

const socket = io();
const $ = (id) => document.getElementById(id);

const state = { connected: false, modeLabel: 'Zombie Raid', players: [], match: null, pvp: null, final: null, announcement: null, boss: null };

// Maps a PvP team id to its display colour name.
const teamName = (t) => (t === 'teamA' ? 'Blue' : t === 'teamB' ? 'Red' : '—');

// Utility helpers to escape HTML, format the match clock, and rank players by kills.
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

// Renders the server connection status indicator.
function renderStatus() {
  $('modeLabel').textContent = state.modeLabel;
  if ($('dot')) $('dot').classList.toggle('live', state.connected);
  if ($('statusText')) $('statusText').textContent = state.connected ? 'Online' : 'Offline';
}

// Renders the match timer or game over results.
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
  // Past the survive mark the dragon boss is loose: swap the countdown for its health readout.
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

// Renders the leaderboard: grouped by team (leading team first) in PvP, by kills otherwise.
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
    const hp = Number(p.hp), max = Number(p.maxHp || 100);
    const pct = Number.isFinite(hp) && max > 0 ? Math.max(0, Math.min(100, Math.round(hp / max * 100))) : 100;
    const label = p.dead ? 'Down' : Number.isFinite(hp) ? `${pct}% HP` : 'Ready';
    const cls = p.dead ? 'hp-dead' : pct <= 30 ? 'hp-critical' : pct < 100 ? 'hp-hurt' : 'hp-healthy';
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

// Updates the entire UI rendering.
function render() { renderStatus(); renderResult(); renderBoard(); }

// Shows a temporary announcement in place of the leaderboard rows (e.g. "all players left").
function showAnnouncement(message, durationMs = 3500) {
  state.announcement = message;
  render();
  clearTimeout(showAnnouncement.timer);
  showAnnouncement.timer = setTimeout(() => { state.announcement = null; render(); }, durationMs);
}

// Background music (intro/cave loops + win/lose stings) that ducks under the cheerleader voice.
const MUSIC = {
  intro:    { src: 'assets/audio/intro.ogg',    loop: true,  vol: 0.40 },
  cave:     { src: 'assets/audio/cave.ogg',     loop: true,  vol: 0.40 },
  boss:     { src: 'assets/audio/boss_fight.ogg', loop: true,  vol: 0.45 },
  success:  { src: 'assets/audio/success.wav',   loop: false, vol: 0.75 },
  gameover: { src: 'assets/audio/game_over.wav', loop: false, vol: 0.75 },
};
const MUSIC_DUCK = 0.15; // Music volume multiplier while the cheerleader is speaking.
const musicEls = {};
let currentMusicKey = null, pendingMusicKey = null, musicMode = null, musicDucked = false;

// Lazily creates (and caches) the Audio element for a track.
function musicEl(key) {
  if (musicEls[key]) return musicEls[key];
  const el = new Audio(MUSIC[key].src);
  el.loop = MUSIC[key].loop;
  el.volume = 0;
  el.preload = 'auto'; // Buffer ahead so a weak network doesn't under-run mid-playback.
  musicEls[key] = el;
  // Stings don't use native loop; replay them a fixed number of times, then stop.
  el.addEventListener('ended', () => {
    if (el !== musicEls[currentMusicKey]) return; // Superseded by another track.
    if (--el._playsLeft > 0) { el.currentTime = 0; el.play().catch(() => {}); }
  });
  return el;
}

function musicTargetVol(key) {
  const def = MUSIC[key];
  // Only looping beds duck under the voice; win/lose stings always play at full volume.
  const duck = musicDucked && def.loop ? MUSIC_DUCK : 1;
  return def.vol * duck;
}

// Linear volume fade so track swaps and ducking are smooth instead of abrupt.
function fadeMusic(el, to, ms, onDone) {
  clearInterval(el._fade);
  const from = el.volume, steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  el._fade = setInterval(() => {
    el.volume = Math.max(0, Math.min(1, from + (to - from) * (++i / steps)));
    if (i >= steps) { clearInterval(el._fade); el._fade = null; onDone && onDone(); }
  }, 50);
}

// Crossfades to a new track (or silence when key is null); no-ops if already active.
function playMusic(key) {
  if (key === currentMusicKey) return;
  const prev = currentMusicKey;
  currentMusicKey = key;
  if (prev && musicEls[prev]) {
    const p = musicEls[prev];
    fadeMusic(p, 0, 400, () => { p.pause(); p.currentTime = 0; });
  }
  if (!key) return;
  const el = musicEl(key);
  el.currentTime = 0;
  el._playsLeft = MUSIC[key].repeat || 1;
  el.play()
    .then(() => fadeMusic(el, musicTargetVol(key), 400))
    .catch(() => { pendingMusicKey = key; }); // Autoplay blocked until a user gesture.
}

// Retries a track that autoplay blocked, once the page gets its first interaction.
function unlockMusic() {
  if (!pendingMusicKey) return;
  const key = pendingMusicKey;
  pendingMusicKey = null;
  if (key !== currentMusicKey) return;
  const el = musicEl(key);
  el.play().then(() => fadeMusic(el, musicTargetVol(key), 400)).catch(() => {});
}
window.addEventListener('pointerdown', unlockMusic);
window.addEventListener('keydown', unlockMusic);

// Preload every track up front so switches are instant even on a weak network.
Object.keys(MUSIC).forEach((key) => musicEl(key).load());

// Ducks the music under the cheerleader voice and restores it afterwards.
function setMusicDuck(on) {
  if (musicDucked === on) return;
  musicDucked = on;
  if (currentMusicKey && musicEls[currentMusicKey]) {
    fadeMusic(musicEls[currentMusicKey], musicTargetVol(currentMusicKey), 400);
  }
}

// Duck music while voice lines play; hold the duck briefly between queued lines to avoid volume pumping.
let voiceDuckTimer = null;
function duckForVoice() {
  clearTimeout(voiceDuckTimer);
  voiceDuckTimer = null;
  setMusicDuck(true);
}
function releaseVoiceDuck(immediate = false) {
  clearTimeout(voiceDuckTimer);
  if (immediate) { voiceDuckTimer = null; return setMusicDuck(false); }
  voiceDuckTimer = setTimeout(() => { voiceDuckTimer = null; setMusicDuck(false); }, 700);
}

// Picks intro vs cave from the live match clock (zombie mode only).
function updateMusicForState(p) {
  if (musicMode !== 'zombie' || !p.match) return;
  const m = p.match;
  const inWarmup = m.warmupMs > 0 && m.elapsedMs < m.warmupMs;
  const inBoss = m.durationMs > 0 && m.elapsedMs >= m.durationMs;
  playMusic(inWarmup ? 'intro' : inBoss ? 'boss' : 'cave');
}

// Cheerleader voice uses Web Audio decoded buffers (per-line `new Audio(dataURI)` distorted on the rig).
const speechQueue = [];
let speaking = false, currentVoice = null, speechGeneration = 0;
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// Browsers start the AudioContext suspended until a user gesture; resume it on the first.
function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  playNextLine();
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Decodes a base64 MP3 payload into raw bytes for the Web Audio decoder.
function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Clears the commentary queue and stops any playing clip.
function stopCommentary() {
  speechGeneration++;
  speechQueue.length = 0;
  if (currentVoice) { try { currentVoice.onended = null; currentVoice.stop(); } catch {} currentVoice = null; }
  speaking = false;
  releaseVoiceDuck(true);
}

// Decodes and plays the next commentary clip in the queue via Web Audio.
async function playNextLine() {
  if (speaking) return;
  const next = speechQueue[0];
  if (!next) return;
  if (!next.line || !next.audio) { speechQueue.shift(); return playNextLine(); }
  speaking = true;
  duckForVoice();
  const gen = speechGeneration;

  const advance = () => {
    if (gen !== speechGeneration) return;
    if (speechQueue[0] === next) speechQueue.shift();
    currentVoice = null;
    speaking = false;
    releaseVoiceDuck();
    playNextLine();
  };

  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await ctx.decodeAudioData(base64ToArrayBuffer(next.audio));
    if (gen !== speechGeneration) return; // Superseded (e.g. match ended) during decode.
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = advance;
    currentVoice = src;
    src.start();
    if (next.line) socket.emit(SOCKET_EVENTS.CHEERLEADER_SPOKEN, { speaker: next.speaker, line: next.line });
  } catch (err) {
    console.warn('[voice] playback failed:', err?.message || err);
    advance();
  }
}

// Listen for server socket events to update players, game state, and commentary audio.
socket.on('connect', () => { state.connected = true; socket.emit(SOCKET_EVENTS.REGISTER_CHEERLEADER_SCREEN); renderStatus(); });
// On disconnect, keep the voice line already playing (it's buffered locally) but clear pending ones.
socket.on('disconnect', () => { state.connected = false; speechQueue.length = 0; renderStatus(); });
socket.on(SOCKET_EVENTS.UPDATE_LOBBY, (p = {}) => { if (!state.match && !state.final) { state.players = p.players || []; if (p.selectedMode) state.modeLabel = titleCase(p.selectedMode); render(); } });
socket.on(SOCKET_EVENTS.GAME_STARTED, (p = {}) => { stopCommentary(); state.final = null; state.pvp = null; state.modeLabel = titleCase(p.selectedMode || state.modeLabel); musicMode = p.selectedMode || musicMode; playMusic(musicMode === 'zombie' ? 'intro' : null); render(); });
socket.on(SOCKET_EVENTS.GAME_STATE, (p = {}) => { state.players = p.players || []; state.match = p.match || null; state.pvp = p.pvp || null; state.boss = (p.enemies || []).find((e) => e.type === 'dragon') || null; updateMusicForState(p); render(); });
socket.on(SOCKET_EVENTS.GAME_OVER, (p = {}) => { state.final = p; state.match = null; state.pvp = null; if (musicMode === 'zombie') playMusic(p.outcome === 'win' ? 'success' : 'gameover'); render(); });
socket.on(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, (p = {}) => p.message && showAnnouncement(p.message, p.durationMs));
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
    musicMode = config.selectedMode || musicMode;
    renderStatus();
  } catch (_) {}
}

loadConfig();
render();
setInterval(renderResult, 250);
