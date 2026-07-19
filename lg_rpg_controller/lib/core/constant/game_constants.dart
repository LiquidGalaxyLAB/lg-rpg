abstract final class GameMode {
  static const pvp = 'pvp';
  static const zombie = 'zombie';

  static const defaultMode = zombie;
  static const values = {pvp, zombie};
}

abstract final class GameModeLabel {
  static const pvp = 'PvP Mode';
  static const zombie = 'Zombie Mode';
}

abstract final class PvpTeam {
  static const teamA = 'teamA';
  static const teamB = 'teamB';

  static const values = {teamA, teamB};

  static String label(String team) => team == teamA ? 'Blue' : 'Red';
}

abstract final class GameServerConfig {
  // 8111 is whitelisted on the LG rig firewall (3000 is not); keep in sync with the server's PORT default.
  static const port = 8111;

  static String urlForHost(String host) {
    final trimmed = host.trim();
    if (trimmed.isEmpty) return '';
    return 'http://$trimmed:$port';
  }
}

abstract final class SocketEvent {
  static const joinLobby = 'joinLobby';
  static const leaveLobby = 'leaveLobby';
  static const updateLobby = 'updateLobby';
  static const lobbyError = 'lobbyError';
  static const selectGameMode = 'selectGameMode';
  static const selectTeam = 'selectTeam';
  static const startGame = 'startGame';
  static const gameStarted = 'gameStarted';
  static const move = 'move';
  static const playerAttack = 'playerAttack';
  static const activatePowerup = 'activatePowerup';
  static const selectCharacter = 'selectCharacter';
  static const setLoadout = 'setLoadout';
  static const gameState = 'gameState';
  static const gameOver = 'gameOver';
  static const youDied = 'youDied';
  static const youRespawned = 'youRespawned';
}

// Loadout catalog. Keep ids and cooldowns in sync with the server's shared_constants.js.

/// A horizontal sprite strip; [frames] is how many frames make up the animation loop.
class SpriteDef {
  final String asset;
  final int frames;
  const SpriteDef(this.asset, this.frames);
}

/// A special attack in a character's kit. Ids present in the server's PLAYER_RANGED fire projectiles; `stub` ones just swing melee for now.
class SpecialDef {
  final String id;
  final String label;
  final String icon; // emoji
  final int cooldownMs;
  final bool stub;
  final String desc;
  final int
      damage; // per-hit damage; 0 = unknown (stubbed specials swing melee)
  final String dmgNote; // one-word qualifier, e.g. "splash", "pierce", "burn"
  final SpriteDef? sprite; // in-game projectile art, falls back to [icon]
  const SpecialDef(
    this.id,
    this.label,
    this.icon,
    this.cooldownMs, {
    this.stub = false,
    this.desc = '',
    this.damage = 0,
    this.dmgNote = '',
    this.sprite,
  });
}

/// A playable character and its kit. Specials load free (not part of the loadout).
class CharacterDef {
  final String id;
  final String displayName;
  final String role;
  final String blurb;
  final String basicIcon;
  final List<SpecialDef> specials;
  final SpriteDef? idleSprite; // in-game idle animation for portraits
  // Base combat stats, mirrored from the server (PLAYER_DEFAULTS + basic attack).
  final int maxHealth;
  final String basicLabel; // the normal attack's name, e.g. "Arrow", "Swing"
  final int basicDamage;
  final int basicCooldownMs;
  final String basicNote; // e.g. "single target", "hits all nearby"
  const CharacterDef({
    required this.id,
    required this.displayName,
    required this.role,
    required this.blurb,
    required this.basicIcon,
    required this.specials,
    this.idleSprite,
    this.maxHealth = 100,
    this.basicLabel = 'Attack',
    this.basicDamage = 0,
    this.basicCooldownMs = 0,
    this.basicNote = '',
  });
}

/// An equippable loadout item — a power-up buff or a health potion.
class LoadoutItemDef {
  final String id;
  final String label;
  final String icon;
  final String desc;
  final int cooldownMs;
  final bool isHealth;
  const LoadoutItemDef(
    this.id,
    this.label,
    this.icon,
    this.desc,
    this.cooldownMs, {
    this.isHealth = false,
  });
}

abstract final class LoadoutConfig {
  static const slots = 4;
}

abstract final class PowerupCatalog {
  static const items = <LoadoutItemDef>[
    LoadoutItemDef('speed', 'Speed', '⚡', '2.9× move speed for 10s.', 25000),
    LoadoutItemDef(
        'shield', 'Shield', '🛡', 'Immune to enemy damage for 15s.', 35000),
    LoadoutItemDef('reflect', 'Reflect', '↩',
        'Bounce enemy damage back doubled, 15s.', 40000),
    LoadoutItemDef('power', '2× Damage', '💥',
        'Double your attack damage for 10s.', 30000),
  ];
}

abstract final class HealthCatalog {
  static const items = <LoadoutItemDef>[
    LoadoutItemDef(
        'minor', 'Minor Potion', '🧪', '+25 HP · short cooldown.', 6000,
        isHealth: true),
    LoadoutItemDef(
        'greater', 'Greater Potion', '⚗', '+50 HP · medium cooldown.', 15000,
        isHealth: true),
    LoadoutItemDef('elixir', 'Elixir', '🍶', '+90 HP · long cooldown.', 30000,
        isHealth: true),
  ];
}

abstract final class CharacterCatalog {
  static const characters = <CharacterDef>[
    CharacterDef(
      id: 'huntress',
      displayName: 'Huntress',
      role: 'Archer',
      blurb: 'Ranged specialist — burst, poison, pierce and homing.',
      basicIcon: '🏹',
      idleSprite: SpriteDef('assets/sprites/huntress/idle.png', 10),
      maxHealth: 100,
      basicLabel: 'Arrow',
      basicDamage: 35,
      basicCooldownMs: 500,
      basicNote: 'Single target',
      specials: [
        SpecialDef('fire', 'Fire', '🔥', 4000,
            damage: 70,
            dmgNote: 'splash',
            desc: 'Splash burst — one-shots basic zombies.',
            sprite: SpriteDef('assets/sprites/huntress/proj_fire.png', 4)),
        SpecialDef('poison', 'Acid', '☠', 4000,
            damage: 28,
            dmgNote: 'burn',
            desc: 'Light hit, then burns over time.',
            sprite: SpriteDef('assets/sprites/huntress/proj_poison.png', 6)),
        SpecialDef('magic', 'Magic', '✦', 3500,
            damage: 50,
            dmgNote: 'pierce',
            desc: 'Pierces a line of enemies.',
            sprite: SpriteDef('assets/sprites/huntress/proj_magic.png', 4)),
        SpecialDef('ghost', 'Ghost', '👻', 5000,
            damage: 50,
            dmgNote: 'homing',
            desc: 'Slow homing orb with splash.',
            sprite: SpriteDef('assets/sprites/huntress/proj_ghost.png', 6)),
      ],
    ),
    CharacterDef(
      id: 'water_priestess',
      displayName: 'Water Priestess',
      role: 'Attacker',
      blurb:
          'Melee bruiser — swings hit everything up close. Specials coming soon.',
      basicIcon: '🗡',
      idleSprite: SpriteDef('assets/sprites/water_priestess/idle.png', 8),
      maxHealth: 100,
      basicLabel: 'Swing',
      basicDamage: 15,
      basicCooldownMs: 350,
      basicNote: 'Hits all nearby',
      specials: [
        SpecialDef('tide', 'Tide Slam', '🌊', 4000,
            stub: true, desc: 'Reserved — swings for now.'),
        SpecialDef('riptide', 'Riptide', '💧', 4000,
            stub: true, desc: 'Reserved — swings for now.'),
        SpecialDef('frost', 'Frost Nova', '❄', 5000,
            stub: true, desc: 'Reserved — swings for now.'),
        SpecialDef('blessing', 'Blessing', '✨', 6000,
            stub: true, desc: 'Reserved — swings for now.'),
      ],
    ),
  ];

  static const defaultCharacter = 'huntress';

  static CharacterDef byId(String id) =>
      characters.firstWhere((c) => c.id == id, orElse: () => characters.first);

  static List<LoadoutItemDef> get allItems =>
      [...PowerupCatalog.items, ...HealthCatalog.items];

  static LoadoutItemDef? itemById(String id) {
    for (final it in allItems) {
      if (it.id == id) return it;
    }
    return null;
  }
}
