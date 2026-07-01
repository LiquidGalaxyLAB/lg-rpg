// Coordinates the AI cheerleader commentator using Gemini for text generation and Microsoft Edge TTS for the voice.
import https from 'https';
import { webcrypto } from 'crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Node 16 has no global `crypto`; msedge-tts 2.x uses the Web Crypto API (crypto.subtle / getRandomValues) as a global.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { CHEERLEADER } from '../../../game_constants.js';
import { MODELS, VOICES, buildSummary, banterPrompt, introPrompt } from './personas.js';

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEN_PATH = (model, key) => `/v1beta/models/${model}:generateContent?key=${key}`;

// Checks if the cheerleader commentary is enabled and Gemini API key is configured.
function isEnabled() {
  const flag = String(process.env.CHEERLEADER_ENABLED || '').toLowerCase();
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return (flag === '1' || flag === 'true') && key ? key : null;
}

// Generates commentary dialogue text using the Gemini API.
async function generateText(key, prompt) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } },
    });
    const req = https.request({
      hostname: GEMINI_HOST, path: GEN_PATH(MODELS.text, key), method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => raw += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const hint = res.statusCode === 429 ? ' (quota/rate limit)' : res.statusCode === 400 || res.statusCode === 403 ? ' (invalid API key)' : '';
          console.warn(`[cheerleader] Gemini HTTP ${res.statusCode}${hint}: ${raw.slice(0, 200)}`);
          resolve('');
          return;
        }
        try {
          const json = JSON.parse(raw);
          resolve((json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim());
        } catch { resolve(''); }
      });
    });
    req.on('error', (err) => { console.warn('[cheerleader] text generation failed:', err?.message || err); resolve(''); });
    req.write(body);
    req.end();
  });
}

// MP3 output so the right screen can play the clip as a data URI; timeout guards a stuck connection.
const EDGE_FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
const EDGE_TIMEOUT_MS = 15000;

// Escapes model text so it can't break the SSML document Edge TTS builds around it.
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Converts dialogue text into speech audio (base64 MP3) using Microsoft Edge TTS service.
async function generateAudio(text, voiceId) {
  let tts;
  try {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voiceId, EDGE_FORMAT);
  } catch (err) {
    console.warn('[cheerleader] Edge TTS connect failed:', err?.message || err);
    return '';
  }
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { tts.close(); } catch { }
      resolve(val);
    };
    const timer = setTimeout(() => { console.warn('[cheerleader] Edge TTS timed out'); finish(''); }, EDGE_TIMEOUT_MS);
    const collect = () => finish(chunks.length ? Buffer.concat(chunks).toString('base64') : '');

    Promise.resolve(tts.toStream(escapeXml(text)))
      .then(({ audioStream }) => {
        audioStream.on('data', (chunk) => chunks.push(chunk));
        audioStream.on('end', collect);
        audioStream.on('close', collect);
        audioStream.on('error', (err) => { console.warn('[cheerleader] Edge TTS stream error:', err?.message || err); finish(''); });
      })
      .catch((err) => { console.warn('[cheerleader] Edge TTS request failed:', err?.message || err); finish(''); });
  });
}

// Maps raw game events to human-readable summaries for the AI model.
const EVENT_MAPPERS = {
  match_start: () => 'the match kicked off',
  kill: (d) => `${d.name} got a kill (${d.kills} total)`,
  player_low_health: (d) => `${d.name} is low on health (${d.hp} HP)`,
  player_died: (d) => `${d.name} went down`,
  match_won: () => 'the squad survived and won the match',
  match_lost: () => 'the squad was wiped out',
};

const summarize = (events) => events.map((ev) => EVENT_MAPPERS[ev.type]?.(ev.data || {})).filter(Boolean).join('; ');

// Parses model output text into individual lines spoken by characters.
function parseBanter(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const m = /^(curly|julie)\s*:\s*(.+)$/i.exec(raw.trim());
    if (m) out.push({ who: m[1].toLowerCase(), line: m[2].trim() });
  }
  if (!out.length && text.trim()) out.push({ who: 'curly', line: text.trim() });
  return out;
}

// Factory function that creates the cheerleader commentator state machine.
export function createCheerleader({ drain, play, getMatchContext }) {
  const key = isEnabled();
  if (!key) return null;

  let introTimer, tickTimer, running = false, commentaryChain = Promise.resolve(), tickQueued = false;
  const transcript = [];

  // Chains commentary actions to run sequentially and avoid overlapping voice clips.
  const enqueueCommentary = (label, task) =>
    commentaryChain = commentaryChain.catch(() => { }).then(task).catch((err) => console.warn(`[cheerleader] ${label} failed:`, err?.message || err));

  const queueTick = () => {
    if (tickQueued) return commentaryChain;
    tickQueued = true;
    return enqueueCommentary('tick', async () => { try { await doTick(); } finally { tickQueued = false; } });
  };

  const remember = (line) => {
    transcript.push(line);
    if (transcript.length > CHEERLEADER.maxTranscript) transcript.shift();
  };

  // Builds the prompt summary plus the mode id, so prompts can select mode facts.
  const matchSummary = (recentEvent) => {
    const ctx = getMatchContext();
    return { summary: buildSummary({ ...ctx, recentEvent }), modeId: ctx.modeId };
  };

  const speak = async (line, speaker = 'Curly') => {
    if (!line || !running) return;
    const audio = await generateAudio(line, VOICES[speaker] || VOICES.Curly);
    if (running) play({ speaker, line, audio });
  };

  const generateAndPlayBanter = async (prompt) => {
    const text = await generateText(key, prompt);
    if (!running) return;
    const banter = parseBanter(text);
    if (banter.length >= 2) {
      for (const { who, line } of banter) {
        if (!running) return;
        const speaker = who === 'julie' ? 'Julie' : 'Curly';
        remember(`${speaker}: ${line}`);
        await speak(line, speaker);
      }
    }
  };

  const doIntro = async () => {
    if (!running) return;
    try {
      drain();
      const { summary, modeId } = matchSummary('the match is about to start');
      await generateAndPlayBanter(introPrompt(summary, modeId));
    } catch (err) { console.warn('[cheerleader] intro failed:', err?.message || err); }
  };

  const doTick = async () => {
    if (!running) return;
    try {
      const recent = summarize(drain()) || 'no new events — the fight is still on';
      const { summary, modeId } = matchSummary(recent);
      await generateAndPlayBanter(banterPrompt(summary, transcript, modeId));
    } catch (err) { console.warn('[cheerleader] tick failed:', err?.message || err); }
  };

  return {
    // Starts commentary timers for match intro and regular updates.
    start() {
      if (running) return;
      running = true;
      introTimer = setTimeout(() => enqueueCommentary('intro', doIntro), CHEERLEADER.introDelayMs);
      tickTimer = setInterval(queueTick, CHEERLEADER.tickMs);
    },
    // Triggers final match commentary and clears timers.
    async finale() {
      if (!running) return;
      clearTimeout(introTimer); clearInterval(tickTimer);
      introTimer = tickTimer = null;
      await enqueueCommentary('finale', doTick);
    },
    // Stops all timers and clears commentator state.
    stop() {
      running = tickQueued = false;
      clearTimeout(introTimer); clearInterval(tickTimer);
      introTimer = tickTimer = null;
      transcript.length = 0;
    }
  };
}
