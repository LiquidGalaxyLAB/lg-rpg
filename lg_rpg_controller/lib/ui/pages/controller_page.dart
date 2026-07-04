import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_joystick/flutter_joystick.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';

class ControllerPage extends ConsumerStatefulWidget {
  const ControllerPage({super.key});

  @override
  ConsumerState<ControllerPage> createState() => _ControllerPageState();
}

class _ControllerPageState extends ConsumerState<ControllerPage> {
  // PvP respawns shortly after death, so we stay on this page and dim the controls with a "Downed" overlay instead of routing to MatchWaitingPage; Zombie permadeath still routes there.
  bool _isDowned = false;

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  Future<void> _leaveMatch() async {
    await ref.read(leaveLobbyUseCaseProvider).call();
    if (!mounted) return;
    ref.read(navigationProvider.notifier).setIndex(NavigationIndex.home);
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

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppGradients.heroGlow),
        child: SafeArea(
          child: Stack(
            children: [
              IgnorePointer(
                ignoring: _isDowned,
                child: Row(
                  children: [
                    // Left: movement joystick on a subtle base ring.
                    Expanded(
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppColors.surface.withValues(alpha: 0.5),
                            border: Border.all(color: AppColors.border),
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
                    // Right: attack button (server cooldown-gates rapid taps).
                    Expanded(
                      child: Center(
                        child: GestureDetector(
                          onTap: () =>
                              ref.read(attackPlayerUseCaseProvider).call(),
                          child: Container(
                            width: 128,
                            height: 128,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: AppGradients.accent,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.18),
                                  blurRadius: 18,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: const Icon(Icons.gps_fixed,
                                color: Colors.white, size: 52),
                          ),
                        ),
                      ),
                    ),
                  ],
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
                          const Icon(Icons.favorite_border_rounded,
                              size: 48, color: AppColors.danger),
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
                  color: AppColors.surface.withValues(alpha: 0.6),
                  shape: const CircleBorder(),
                  child: IconButton(
                    tooltip: 'Leave Match',
                    icon: const Icon(Icons.close_rounded,
                        color: AppColors.onSurface),
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
}
