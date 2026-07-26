// Socket-driven music + cheerleader voice for whichever page owns the rig's speakers. Init on ONE page per rig, or audio doubles up.
import { SOCKET_EVENTS } from './shared_constants.js';

export function initGameAudio(socket) {
  // Loops + win/lose stings; the loops duck under the cheerleader voice.
  const MUSIC = {
    intro:    { src: 'assets/audio/intro.ogg',    loop: true,  vol: 0.40 },
    cave:     { src: 'assets/audio/cave.ogg',     loop: true,  vol: 0.40 },
    boss:     { src: 'assets/audio/boss_fight.ogg', loop: true,  vol: 0.45 },
    // PvP has no warmup/intro phase, so this tension bed runs for the whole match.
    pvp:      { src: 'assets/audio/pvp_battle.ogg', loop: true,  vol: 0.30 },
    success:  { src: 'assets/audio/success.wav',   loop: false, vol: 0.75 },
    gameover: { src: 'assets/audio/game_over.wav', loop: false, vol: 0.75 },
  };
  // Volume while the cheerleader speaks — quiet enough to stay out of the way, loud enough to keep the bed audible. VOICE_GAIN buys the headroom.
  const MUSIC_DUCK = 0.30;
  const DUCK_FADE_MS = 350;   // Ease down as a line starts, rather than cutting.
  const UNDUCK_FADE_MS = 900; // Come back slower, so it swells instead of popping.
  const musicEls = {};
  let currentMusicKey = null, pendingMusicKey = null, musicMode = null, musicDucked = false;

  // Lazily creates and caches a track's Audio element.
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
    el.addEventListener('error', () => {
      console.warn(`[audio] track "${key}" failed to load (${MUSIC[key].src}):`, el.error?.message || el.error?.code);
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

  // Starts (or restarts) a track from the top and fades it in to its target volume.
  function startTrack(key, { rewind = true } = {}) {
    const el = musicEl(key);
    if (rewind) el.currentTime = 0;
    el._playsLeft = MUSIC[key].repeat || 1;
    el.play()
      .then(() => fadeMusic(el, musicTargetVol(key), 400))
      .catch((err) => {
        // Autoplay blocked until a user gesture; retried by unlockMusic and the per-tick re-assert in updateMusicForState.
        pendingMusicKey = key;
        console.warn(`[audio] music "${key}" blocked (${err?.name || err}); click this page once to start it.`);
      });
  }

  // Crossfades to a new track (null = silence); re-asserting the current one restarts it if silent, so the per-tick calls self-heal.
  function playMusic(key) {
    if (key === currentMusicKey) {
      if (key && musicEls[key]?.paused) startTrack(key, { rewind: false });
      return;
    }
    const prev = currentMusicKey;
    currentMusicKey = key;
    if (prev && musicEls[prev]) {
      const p = musicEls[prev];
      fadeMusic(p, 0, 400, () => { p.pause(); p.currentTime = 0; });
    }
    if (!key) return;
    console.log(`[audio] music -> ${key} (mode=${musicMode})`);
    startTrack(key);
  }

  // Retries a blocked track on first interaction — whatever is current now, since it may have changed while blocked.
  function unlockMusic() {
    if (!pendingMusicKey) return;
    pendingMusicKey = null;
    if (currentMusicKey && musicEls[currentMusicKey]?.paused) startTrack(currentMusicKey, { rewind: false });
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
      fadeMusic(musicEls[currentMusicKey], musicTargetVol(currentMusicKey), on ? DUCK_FADE_MS : UNDUCK_FADE_MS);
    }
  }

  // The duck is held briefly between queued lines, to avoid volume pumping.
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

  // Runs every tick, so a track that never started (blocked autoplay, stalled buffer) is retried; `match` is null between matches, leaving the sting alone.
  function updateMusicForState(p) {
    if (!p.match) return;
    // PvP has no phases: one bed for the whole round.
    if (musicMode === 'pvp') return playMusic('pvp');
    if (musicMode !== 'zombie') return;
    const m = p.match;
    const inWarmup = m.warmupMs > 0 && m.elapsedMs < m.warmupMs;
    const inBoss = m.durationMs > 0 && m.elapsedMs >= m.durationMs;
    playMusic(inWarmup ? 'intro' : inBoss ? 'boss' : 'cave');
  }

  // Web Audio decoded buffers; per-line `new Audio(dataURI)` distorted on the rig.
  const speechQueue = [];
  let speaking = false, currentVoice = null, speechGeneration = 0;
  let audioCtx = null, voiceGain = null;
  const VOICE_GAIN = 2.0; // TTS lines come back quiet; lift them so they cut over the music on rig speakers.

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // Shared output stage for every voice line: gain lift plus a limiter so the lift can't clip.
  function getVoiceOut() {
    if (voiceGain) return voiceGain;
    const ctx = getAudioCtx();
    voiceGain = ctx.createGain();
    voiceGain.gain.value = VOICE_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    voiceGain.connect(limiter).connect(ctx.destination);
    return voiceGain;
  }

  // Browsers start the AudioContext suspended until a user gesture.
  function unlockAudio() {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    playNextLine();
  }
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function stopCommentary() {
    speechGeneration++;
    speechQueue.length = 0;
    if (currentVoice) { try { currentVoice.onended = null; currentVoice.stop(); } catch {} currentVoice = null; }
    speaking = false;
    releaseVoiceDuck(true);
  }

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
      src.connect(getVoiceOut());
      src.onended = advance;
      currentVoice = src;
      src.start();
      if (next.line) socket.emit(SOCKET_EVENTS.CHEERLEADER_SPOKEN, { speaker: next.speaker, line: next.line });
    } catch (err) {
      console.warn('[voice] playback failed:', err?.message || err);
      advance();
    }
  }

  // Claims commentary audio. Logged because only one page per rig may own it — two log lines means the later one won.
  const register = () => {
    console.log('[audio] registering as cheerleader screen', window.location.search);
    socket.emit(SOCKET_EVENTS.REGISTER_CHEERLEADER_SCREEN);
  };
  if (socket.connected) register();
  socket.on('connect', register);
  // The playing line is buffered locally, so it survives; only pending ones are dropped.
  socket.on('disconnect', () => { speechQueue.length = 0; });

  socket.on(SOCKET_EVENTS.GAME_STARTED, (p = {}) => {
    stopCommentary();
    if (p.selectedMode) musicMode = p.selectedMode;
    // Zombie opens on the intro bed during warmup; PvP drops straight into the battle bed.
    playMusic(musicMode === 'zombie' ? 'intro' : musicMode === 'pvp' ? 'pvp' : null);
  });
  socket.on(SOCKET_EVENTS.GAME_STATE, (p = {}) => updateMusicForState(p));
  socket.on(SOCKET_EVENTS.GAME_OVER, (p = {}) => {
    if (musicMode === 'zombie') playMusic(p.outcome === 'win' ? 'success' : 'gameover');
    // Someone always wins a PvP round, so end on the victory sting.
    else if (musicMode === 'pvp') playMusic('success');
  });
  socket.on(SOCKET_EVENTS.CHEERLEADER_AUDIO, (p = {}) => {
    console.log(`[audio] voice line received: "${p.line || '(none)'}" audio=${p.audio ? `${p.audio.length}b` : 'MISSING'}`);
    if (!p.line) return;
    speechQueue.push(p);
    const first = speaking ? 1 : 0;
    while (speechQueue.length - first > 2) speechQueue.splice(first, 1);
    playNextLine();
  });

  return {
    // The page tells us the selected mode once it has fetched /api/config.
    setMode(mode) { if (mode) musicMode = mode; },
  };
}
