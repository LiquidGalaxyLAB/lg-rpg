// Defines AI commentator configurations, personas, and prompts for text generation.

// Gemini AI model version used for text generation.
export const MODELS = Object.freeze({
  text: 'gemini-2.5-flash',
});

// AWS Polly voice mappings for the two AI commentators.
export const VOICES = Object.freeze({
  Curly: 'Joanna',
  Julie: 'Kendra',
});

// Builds a human-readable summary of the current match state for the AI model.
export function buildSummary({
  mode = 'Zombie Mode',
  players = [],
  timeRemaining = 0,
  elapsedSeconds = 0,
  enemyCount = 0,
  recentEvent = 'no major event',
} = {}) {
  const playerLines = players.length > 0
    ? players.map((p) => {
      const hp = Number.isFinite(Number(p.hp)) ? Number(p.hp) : 0;
      const maxHp = Number.isFinite(Number(p.maxHp)) ? Number(p.maxHp) : 100;
      return `  ${p.name}: HP ${hp}/${maxHp}, kills ${p.kills || 0}, status: ${p.status || 'unknown'}`;
    }).join('\n')
    : '  No players listed';

  return (
    `Mode: ${mode}\n` +
    `Time: ${elapsedSeconds}s elapsed, ${timeRemaining}s remaining\n` +
    `Enemies on map right now: ${enemyCount}\n` +
    `Players:\n${playerLines}\n` +
    `Recent: ${recentEvent || 'no major event'}`
  );
}

// Ground rules and facts about the game modes to keep the AI accurate.
const GAME_FACTS =
  `GAME FACTS (never contradict these):
- Zombie Mode: the squad must survive for 3 minutes. Win = timer reaches 0 with at least one player alive. Loss = all players reach 0 HP before time is up.
- Enemies spawn continuously. The map starts with up to 25 enemies; the cap rises by 11 each minute of play, reaching at most ~47 by late match. Kill one and another spawns — there is no "clearing the horde".
- Player names, HP, kills, and enemy counts come ONLY from the MATCH STATE below. Do NOT invent or change any name or number.`;

// Personalities and dialogue constraints for each commentator.
const STYLE =
  `Curly and Julie are live commentators in a zombie-survival arena booth.
Curly: hype and emotional — reacts to momentum, stays hopeful or worried based on what's real.
Julie: dry analyst — always replies DIRECTLY to what Curly just said, works HP/time/enemy pressure into natural speech.
Rules: warm, witty, never mean. Max 12 words per line. No filler openers (Oh / Wow / Well / Ah).`;

// Generates the AI prompt for the match starting announcement.
export function introPrompt(summary) {
  return (
    `${STYLE}\n\n${GAME_FACTS}\n\n` +
    `MATCH STATE:\n${summary}\n\n` +
    `The match has NOT started yet — no enemies, no combat.\n` +
    `Write the opening (2 lines):\n` +
    `Curly: welcome the crowd, hype the players using their EXACT names from MATCH STATE.\n` +
    `Julie: reply to Curly, explain the win condition (survive 3 minutes), hand off to the start.\n\n` +
    `Output ONLY this format:\nCurly: <line>\nJulie: <line>`
  );
}

// Generates the AI prompt for mid-game dialogue based on recent events and history.
export function banterPrompt(summary, transcript) {
  const memory = transcript?.length
    ? `Recent booth lines (don't repeat these):\n${transcript.join('\n')}\n\n`
    : '';

  return (
    `${STYLE}\n\n${GAME_FACTS}\n\n` +
    `${memory}` +
    `MATCH STATE:\n${summary}\n\n` +
    `Write the NEXT exchange:\n` +
    `- Curly reacts to the current mood — hopeful or worried — based on actual HP and time remaining.\n` +
    `- Julie replies DIRECTLY to Curly: pick up her exact point and agree, tease, or counter. Address her by name sometimes. Vary her angle each turn — rotate between HP, clock, a specific player, kills, or enemy pressure. Never open with a number readout.\n` +
    `- Neither host calls an easy win unless HP and time genuinely support it.\n\n` +
    `Output ONLY this format:\nCurly: <line>\nJulie: <line>`
  );
}
