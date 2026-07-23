import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_joystick/flutter_joystick.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/widgets/sprite_sheet.dart';

class ControllerPage extends ConsumerStatefulWidget {
  const ControllerPage({super.key});

  @override
  ConsumerState<ControllerPage> createState() => _ControllerPageState();
}

class _ControllerPageState extends ConsumerState<ControllerPage> {
  // PvP respawns shortly after death, so we stay on this page and dim the controls with a "Downed" overlay instead of routing to MatchWaitingPage; Zombie permadeath still routes there.
  bool _isDowned = false;

  // The chosen character + loadout for this match (fixed once the match starts).
  late final CharacterDef _character;
  late final List<String> _loadout;

  // Armed special (fired on the next ATTACK, then reverts to normal), and the client-side cooldown end times keyed by 'sp:<id>' / 'it:<id>'.
  String? _armedId;
  int _armedCdMs = 0;
  final Map<String, DateTime> _readyAt = {};
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    final repo = ref.read(gameServerRepositoryProvider);
    _character = CharacterCatalog.byId(repo.selectedCharacter);
    _loadout = repo.selectedLoadout;
    // Repaint cooldown rings while any are counting down.
    _ticker = Timer.periodic(const Duration(milliseconds: 120), (_) {
      if (!mounted) return;
      final now = DateTime.now();
      if (_readyAt.values.any((t) => t.isAfter(now))) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  bool _onCooldown(String key) {
    final end = _readyAt[key];
    return end != null && end.isAfter(DateTime.now());
  }

  double _cooldownFraction(String key, int cdMs) {
    final end = _readyAt[key];
    if (end == null || cdMs <= 0) return 0;
    final leftMs = end.difference(DateTime.now()).inMilliseconds;
    if (leftMs <= 0) return 0;
    return (leftMs / cdMs).clamp(0.0, 1.0);
  }

  void _startCooldown(String key, int ms) {
    _readyAt[key] = DateTime.now().add(Duration(milliseconds: ms));
  }

  void _armSpecial(SpecialDef s) {
    if (_onCooldown('sp:${s.id}')) return; // greyed while cooling down
    setState(() {
      if (_armedId == s.id) {
        _armedId = null; // tap again to disarm
      } else {
        _armedId = s.id;
        _armedCdMs = s.cooldownMs;
      }
    });
  }

  void _attack() {
    final armed = _armedId;
    if (armed != null) {
      ref.read(attackPlayerUseCaseProvider).call(kind: armed);
      setState(() {
        _startCooldown('sp:$armed', _armedCdMs);
        _armedId = null; // one-shot: revert to normal attack
      });
    } else {
      ref.read(attackPlayerUseCaseProvider).call();
    }
  }

  void _activateItem(LoadoutItemDef it) {
    if (_onCooldown('it:${it.id}')) return;
    ref.read(activatePowerupUseCaseProvider).call(it.id);
    setState(() => _startCooldown('it:${it.id}', it.cooldownMs));
  }

  Future<void> _leaveMatch() async {
    await ref.read(leaveLobbyUseCaseProvider).call();
    if (!mounted) return;
    ref.read(navigationProvider.notifier).setIndex(NavigationIndex.home);
  }

  SpecialDef? get _armedSpecial {
    if (_armedId == null) return null;
    for (final s in _character.specials) {
      if (s.id == _armedId) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(playerDiedStreamProvider, (_, next) {
      next.whenData((_) {
        if (ref.read(currentMatchModeProvider) != GameMode.pvp) return;
        if (mounted) setState(() => _isDowned = true);
      });
    });
    ref.listen(playerRespawnedStreamProvider, (_, next) {
      next.whenData((_) {
        if (mounted) setState(() => _isDowned = false);
      });
    });

    final p = context.palette;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: p.heroGlow),
        child: SafeArea(
          child: Stack(
            children: [
              IgnorePointer(
                ignoring: _isDowned,
                child: Row(
                  children: [
                    // Left: movement joystick. FittedBox keeps it from overflowing on small screens.
                    Expanded(
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Container(
                              padding: const EdgeInsets.all(18),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: p.surface.withValues(alpha: 0.5),
                                border: Border.all(color: p.border),
                              ),
                              child: Joystick(
                                listener: (details) {
                                  ref
                                      .read(movePlayerUseCaseProvider)
                                      .call(details.x, details.y);
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    // Right: specials row, ATTACK, loadout row.
                    Expanded(
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                _buildSpecialsRow(),
                                const SizedBox(height: 14),
                                _buildAttackButton(),
                                const SizedBox(height: 14),
                                _buildLoadoutRow(),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              // Character badge so you always know whose kit you're holding.
              Align(
                alignment: Alignment.topCenter,
                child: Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: _CharacterBadge(character: _character),
                ),
              ),
              if (_isDowned)
                Positioned.fill(
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.72),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.favorite_border_rounded,
                              size: 48, color: p.danger),
                          const SizedBox(height: 16),
                          const Text(
                            'Downed',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 24,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Respawning…',
                            style:
                                TextStyle(color: Colors.white70, fontSize: 15),
                          ),
                          const SizedBox(height: 20),
                          const SizedBox(
                            width: 26,
                            height: 26,
                            child: CircularProgressIndicator(
                                strokeWidth: 2.6, color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              // Escape hatch so a player is never stuck in the gameplay view with no way back to the lobby.
              Positioned(
                top: 8,
                left: 8,
                child: Material(
                  color: p.surface.withValues(alpha: 0.6),
                  shape: const CircleBorder(),
                  child: IconButton(
                    tooltip: 'Leave Match',
                    icon: Icon(Icons.close_rounded, color: p.onSurface),
                    onPressed: _leaveMatch,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSpecialsRow() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final s in _character.specials)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: _AbilityButton(
              emoji: s.icon,
              sprite: s.sprite,
              armed: _armedId == s.id,
              cooldownFraction: _cooldownFraction('sp:${s.id}', s.cooldownMs),
              onTap: () => _armSpecial(s),
            ),
          ),
      ],
    );
  }

  Widget _buildLoadoutRow() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (int i = 0; i < LoadoutConfig.slots; i++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: _slotAt(i),
          ),
      ],
    );
  }

  Widget _slotAt(int i) {
    if (i >= _loadout.length) return const _AbilityButton.empty();
    final it = CharacterCatalog.itemById(_loadout[i]);
    if (it == null) return const _AbilityButton.empty();
    return _AbilityButton(
      emoji: it.icon,
      isItem: true,
      cooldownFraction: _cooldownFraction('it:${it.id}', it.cooldownMs),
      onTap: () => _activateItem(it),
    );
  }

  Widget _buildAttackButton() {
    final p = context.palette;
    final armed = _armedSpecial;
    return GestureDetector(
      onTap: _attack,
      child: Container(
        width: 116,
        height: 116,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: p.primaryGradient,
          boxShadow: [
            BoxShadow(
              color: p.primary.withValues(alpha: 0.35),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Center(
          child: armed == null
              ? Icon(Icons.gps_fixed, color: p.onPrimary, size: 48)
              : armed.sprite != null
                  ? AnimatedSprite(
                      armed.sprite!.asset,
                      size: 64,
                      frameCount: armed.sprite!.frames,
                      fps: 12,
                      zoom: 1.15,
                    )
                  : Text(armed.icon, style: const TextStyle(fontSize: 44)),
        ),
      ),
    );
  }
}

/// Small floating pill naming the character in play, with its idle sprite.
class _CharacterBadge extends StatelessWidget {
  final CharacterDef character;
  const _CharacterBadge({required this.character});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final sprite = character.idleSprite;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: p.surface.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: p.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (sprite != null)
            AnimatedSprite(
              sprite.asset,
              size: 34,
              frameCount: sprite.frames,
              fps: 8,
              zoom: 1.8,
              dy: -0.12,
            )
          else
            Text(character.basicIcon, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Text(
            character.displayName,
            style: TextStyle(
              color: p.onSurface,
              fontSize: 13,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// A square ability button with a cooldown ring. `.empty()` shows an unfilled slot.
class _AbilityButton extends StatelessWidget {
  final String emoji;
  final SpriteDef? sprite;
  final bool armed;
  final bool isItem;
  final double cooldownFraction;
  final VoidCallback? onTap;
  final bool empty;

  const _AbilityButton({
    required this.emoji,
    this.sprite,
    this.armed = false,
    this.isItem = false,
    this.cooldownFraction = 0,
    this.onTap,
  }) : empty = false;

  const _AbilityButton.empty()
      : emoji = '',
        sprite = null,
        armed = false,
        isItem = false,
        cooldownFraction = 0,
        onTap = null,
        empty = true;

  static const double _size = 54;

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    if (empty) {
      return Container(
        width: _size,
        height: _size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: p.border.withValues(alpha: 0.6)),
          color: p.surface.withValues(alpha: 0.3),
        ),
        child: Icon(
          Icons.add_rounded,
          size: 20,
          color: p.onSurfaceMuted.withValues(alpha: 0.4),
        ),
      );
    }

    final borderColor = armed
        ? p.primary
        : isItem
            ? p.onSurface.withValues(alpha: 0.35)
            : p.border;
    final cooling = cooldownFraction > 0;

    final face = sprite != null
        ? armed
            // Animate only while armed so idle buttons don't run 4 timers.
            ? AnimatedSprite(sprite!.asset,
                size: 36, frameCount: sprite!.frames, fps: 12, zoom: 1.1)
            : SpriteFrame(sprite!.asset, size: 36, zoom: 1.1)
        : Text(emoji, style: const TextStyle(fontSize: 22));

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: _size,
        height: _size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          color: armed ? p.surfaceHigh : p.surface,
          border: Border.all(color: borderColor, width: armed ? 2 : 1),
          boxShadow: armed
              ? [
                  BoxShadow(
                    color: p.primary.withValues(alpha: 0.35),
                    blurRadius: 12,
                  ),
                ]
              : null,
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            face,
            if (cooling)
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.30),
                    child: Center(
                      child: SizedBox(
                        width: 34,
                        height: 34,
                        child: CircularProgressIndicator(
                          value: cooldownFraction,
                          strokeWidth: 3,
                          color: Colors.white70,
                          backgroundColor: Colors.white24,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
