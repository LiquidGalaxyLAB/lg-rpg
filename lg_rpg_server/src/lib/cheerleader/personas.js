// Defines AI commentator configurations, personas, and prompts for text generation.

// Gemini AI model version used for text generation.
export const MODELS = Object.freeze({
  text: 'gemini-3-flash-preview',
});

// Microsoft Edge TTS voice names for the two AI commentators .
export const VOICES = Object.freeze({
  Curly: 'en-US-AriaNeural',
  Julie: 'en-US-JennyNeural',
});

// Formats the per-player roster line shared by both modes.
function rosterLines(players) {
  if (!players.length) return '  No players listed';
  return players
    .map((p) => {
      const health = Number.isFinite(Number(p.hp)) ? Number(p.hp) : 0;
      const maxhealth = Number.isFinite(Number(p.maxHp)) ? Number(p.maxHp) : 100;
      const team = p.team ? `, team ${p.team === 'teamA' ? 'Blue' : 'Red'}` : '';
      return `  ${p.name}: health ${health}/${maxhealth}, kills ${p.kills || 0}${team}, status: ${p.status || 'unknown'}`;
    })
    .join('\n');
}

// Build a summary of the current match state.
export function buildSummary(ctx = {}) {
  const { mode = 'Zombie Mode', modeId = 'zombie', players = [], recentEvent = 'no major event' } = ctx;
  const playerLines = rosterLines(players);

  let stateLines;
  if (modeId === 'pvp') {
    const s = ctx.scores || {};
    const phaseLine =
      ctx.phase === 'active' ? `Round time left: ${ctx.timeRemaining}s`
        : ctx.phase === 'lock' ? `Teams locked in spawn — fight starts in ${ctx.timeRemaining}s`
          : ctx.phase === 'ended' ? 'Round over'
            : 'Grace period — fight about to begin';
    stateLines =
      `${phaseLine}\n` +
      `Score — Blue ${s.teamA ?? 0} : Red ${s.teamB ?? 0}\n` +
      `Zone held by: ${ctx.zoneTeam === 'teamA' ? 'Blue' : ctx.zoneTeam === 'teamB' ? 'Red' : 'no one'}`;
  } else {
    const phaseLine =
      ctx.phase === 'grace'
        ? `Warm-up: enemies arrive in ${ctx.graceRemaining}s (no combat yet)`
        : `Survive time left: ${ctx.timeRemaining}s`;
    stateLines = `${phaseLine}\nEnemies on map right now: ${ctx.enemyCount ?? 0}`;
  }

  return (
    `Mode: ${mode}\n` +
    `${stateLines}\n` +
    `Players:\n${playerLines}\n` +
    `Recent: ${recentEvent || 'no major event'}`
  );
}

// Mode-specific ground rules so the AI never describes the wrong game.
const ZOMBIE_FACTS =
  `- Mode: Zombie Mode — a co-op survival fight. After a 30-second warm-up, the squad must survive 3 minutes of combat.
- Win = the survive timer reaches 0 with at least one player alive. Loss = every player hits 0 health first.
- Enemies spawn continuously (starts up to 25 on the map, cap rises ~11 each minute). Kill one and another spawns — the horde never clears.
- 1 to 4 players, all on the same side.`;

const PVP_FACTS =
  `- Mode: PvP Zone Capture — two teams, Blue and Red, fight over a single zone.
- Players start locked in a shared spawn, get a short grace period, then fight. Holding the zone alone scores for your team over time.
- Downed players respawn after a few seconds. Win = the higher team score when the round timer ends; equal scores = a draw.
- Reference teams as Blue and Red.`;

const SHARED_FACTS =
  `- Player names, health, kills, scores, time, and enemy counts come ONLY from the MATCH STATE below. Never invent or change a name or number.
- Only reference players listed in MATCH STATE; never imply extra players or a higher count than listed.`;

// Builds the full GAME FACTS block for the active mode.
function gameFacts(modeId) {
  return `GAME FACTS (never contradict these):\n${modeId === 'pvp' ? PVP_FACTS : ZOMBIE_FACTS}\n${SHARED_FACTS}`;
}

// Personalities and dialogue constraints for each commentator.
const STYLE =
  `Curly and Julie are live commentators in an arena game booth.
Curly: hype and emotional — reacts to momentum, stays hopeful or worried based on what's real.
Julie: dry analyst — always replies DIRECTLY to what Curly just said, works the real numbers (health, time, score, enemy pressure) into natural speech.
Rules: warm, witty, never mean. Max 12 words per line. No filler openers (Oh / Wow / Well / Ah).`;

// Generates the AI prompt for the match starting announcement.
export function introPrompt(summary, modeId = 'zombie') {
  return (
    `${STYLE}\n\n${gameFacts(modeId)}\n\n` +
    `MATCH STATE:\n${summary}\n\n` +
    `The match has NOT started yet — no combat yet.\n` +
    `Write the opening (2 lines):\n` +
    `Curly: welcome the crowd, hype ONLY the player(s) listed in MATCH STATE using their EXACT names — do not mention anyone not listed.\n` +
    `Julie: reply to Curly, explain how to win THIS mode (from GAME FACTS), hand off to the start.\n\n` +
    `Output ONLY this format:\nCurly: <line>\nJulie: <line>`
  );
}

// Generates the AI prompt for mid-game dialogue based on recent events and history.
export function banterPrompt(summary, transcript, modeId = 'zombie') {
  const memory = transcript?.length
    ? `Recent booth lines (don't repeat these):\n${transcript.join('\n')}\n\n`
    : '';

  return (
    `${STYLE}\n\n${gameFacts(modeId)}\n\n` +
    `${memory}` +
    `MATCH STATE:\n${summary}\n\n` +
    `Write the NEXT exchange:\n` +
    `- Curly reacts to the current mood — hopeful or worried — based on the real state.\n` +
    `- Julie replies DIRECTLY to Curly: pick up her exact point and agree, tease, or counter. Address her by name sometimes. Vary her angle each turn — rotate between health, the clock, a specific player, kills, score, zone control, or enemy pressure as the mode allows. Never open with a number readout.\n` +
    `- Neither host calls an easy win unless the state genuinely supports it.\n\n` +
    `Output ONLY this format:\nCurly: <line>\nJulie: <line>`
  );
}
