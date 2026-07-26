// Model config, personas and prompts for the AI commentators.

export const MODELS = Object.freeze({
  text: 'gemini-3-flash-preview',
});

// Edge TTS voice names for the two commentators.
export const VOICES = Object.freeze({
  Curly: 'en-US-AriaNeural',
  Julie: 'en-US-JennyNeural',
});

// Per-player roster lines, shared by both modes.
function rosterLines(players) {
  if (!players.length) return '  No players listed';
  return players
    .map((p) => {
      const health = Number.isFinite(Number(p.hp)) ? Number(p.hp) : 0;
      // Mirror the reported max rather than hardcoding one, which would drift the moment PLAYER_DEFAULTS.maxHealth is retuned.
      const maxhealth = Number.isFinite(Number(p.maxHp)) ? Number(p.maxHp) : health;
      const team = p.team ? `, team ${p.team === 'teamA' ? 'Blue' : 'Red'}` : '';
      return `  ${p.name}: health ${health}/${maxhealth}, kills ${p.kills || 0}${team}, status: ${p.status || 'unknown'}`;
    })
    .join('\n');
}

export function buildSummary(ctx = {}) {
  const { mode = 'Zombie Mode', modeId = 'zombie', players = [], recentEvent = 'no major event' } = ctx;
  const playerLines = rosterLines(players);

  let stateLines;
  if (modeId === 'pvp') {
    const s = ctx.scores || {};
    const held = ctx.zonesHeld || {};
    const phaseLine =
      ctx.phase === 'ended' ? 'Round over' : `Round time left: ${ctx.timeRemaining}s`;
    stateLines =
      `${phaseLine}\n` +
      `Score — Blue ${s.teamA ?? 0} : Red ${s.teamB ?? 0}\n` +
      `Circle held by: ${held.teamA > 0 ? 'Blue' : held.teamB > 0 ? 'Red' : 'no one (contested or empty)'}`;
  } else {
    const phaseLine =
      ctx.phase === 'grace'
        ? `Warm-up: enemies arrive in ${ctx.graceRemaining}s (no combat yet)`
        : ctx.phase === 'boss'
          ? 'Boss fight: the dragon has been summoned — slaying it wins the match'
          : `Survive time left: ${ctx.timeRemaining}s`;
    stateLines = `${phaseLine}\nEnemies alive across the whole map: ${ctx.enemyCount ?? 0}`;
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
- When the 3-minute survive timer hits 0, a dragon boss is summoned. Win = slay the dragon (the whole squad wins, including fallen players). Loss = every player hits 0 health first.
- Enemies spawn continuously (up to 9 on the map at first, rising by 4 each minute to a cap of 24). Kill one and another spawns — the horde never clears.
- 1 to 4 players, all on the same side. Kills are the co-op ranking metric.`;

const PVP_FACTS =
  `- Mode: PvP Zone Capture — two teams, Blue and Red, fight over one capture circle in the middle of the arena.
- Each team spawns on its own side and races to the circle. A team earns 1 point for every 6 seconds only it is standing in the circle — a contested circle (both teams inside) scores for nobody.
- Kills do NOT score. Downing an opponent only clears the circle for a few seconds; never call a kill a point or say kills are winning the round.
- The round lasts 2 minutes. Downed players respawn at their own side after about 4 seconds, briefly invulnerable.
- Win = the higher team score when the round timer ends; equal scores = a draw.
- Reference teams as Blue and Red.`;

// Systems both modes share, so the booth can call out a shield or a special instead of only health and kills.
const LOADOUT_FACTS =
  `- Each player picks a character (Huntress, a ranged archer; Water Priestess, a melee bruiser) and carries up to 4 loadout items.
- Loadout items are cooldown-gated, not consumed: Speed (1.8x move), Shield (8s immunity), Reflect (half damage, bounced back doubled), 2x Damage, and healing potions (+25/+50/+90 HP).
- Players start at 100 health.`;

const SHARED_FACTS =
  `- Player names, health, kills, scores, time, and enemy counts come ONLY from the MATCH STATE below. Never invent or change a name or number.
- Only reference players listed in MATCH STATE; never imply extra players or a higher count than listed.
- The enemy count is map-wide. Never claim those enemies surround or chase one specific player.`;

// Builds the full GAME FACTS block for the active mode.
function gameFacts(modeId) {
  return `GAME FACTS (never contradict these):\n${modeId === 'pvp' ? PVP_FACTS : ZOMBIE_FACTS}\n${LOADOUT_FACTS}\n${SHARED_FACTS}`;
}

// Personalities and dialogue constraints for each commentator.
const STYLE =
  `Curly and Julie are live commentators in an arena game booth.
Curly: hype and emotional — reacts to momentum, stays hopeful or worried based on what's real.
Julie: dry analyst — always replies DIRECTLY to what Curly just said, works the real numbers (health, time, score, enemy pressure) into natural speech.
Rules: warm, witty, never mean. Max 12 words per line. No filler openers (Oh / Wow / Well / Ah).`;

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

// Mid-game dialogue, built from recent events plus the booth's own history.
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
