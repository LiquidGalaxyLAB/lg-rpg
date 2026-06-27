// Coordinates the AI cheerleader commentator using Gemini for text generation and AWS Polly for text-to-speech.
import https from 'https';
import crypto from 'crypto';
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
        try {
          const json = res.statusCode === 200 ? JSON.parse(raw) : null;
          resolve((json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim());
        } catch { resolve(''); }
      });
    });
    req.on('error', (err) => { console.warn('[cheerleader] text generation failed:', err?.message || err); resolve(''); });
    req.write(body);
    req.end();
  });
}

const AWS_REGION = (process.env.AWS_REGION || 'ap-south-1').trim();
const POLLY_HOST = `polly.${AWS_REGION}.amazonaws.com`;
const POLLY_SERVICE = 'polly';
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Converts dialogue text into speech audio using AWS Polly API.
async function generateAudio(text, voiceId) {
  const accessKey = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  if (!accessKey || !secretKey) {
    console.warn('[cheerleader] AWS credentials missing — line goes unvoiced');
    return '';
  }
  const body = JSON.stringify({ Text: text, OutputFormat: 'mp3', VoiceId: voiceId, Engine: 'neural' });
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const uri = '/v1/speech';
  const payloadHash = sha256hex(body);
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `content-type:application/json\nhost:${POLLY_HOST}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = ['POST', uri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${AWS_REGION}/${POLLY_SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, dateStamp), AWS_REGION), POLLY_SERVICE), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve) => {
    const req = https.request({
      hostname: POLLY_HOST, path: uri, method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'X-Amz-Date': amzDate, 'X-Amz-Content-Sha256': payloadHash, Authorization: authorization
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) {
          console.warn(`[cheerleader] Polly HTTP ${res.statusCode}: ${buf.toString('utf8').slice(0, 200)}`);
          resolve('');
          return;
        }
        resolve(buf.toString('base64'));
      });
    });
    req.on('error', (err) => { console.warn('[cheerleader] Polly request failed:', err?.message || err); resolve(''); });
    req.write(body);
    req.end();
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
    commentaryChain = commentaryChain.catch(() => {}).then(task).catch((err) => console.warn(`[cheerleader] ${label} failed:`, err?.message || err));

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
