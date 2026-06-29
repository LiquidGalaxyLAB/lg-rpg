import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_joystick/flutter_joystick.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';

class ControllerPage extends ConsumerStatefulWidget {
  const ControllerPage({super.key});

  @override
  ConsumerState<ControllerPage> createState() => _ControllerPageState();
}

class _ControllerPageState extends ConsumerState<ControllerPage> {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppGradients.heroGlow),
        child: SafeArea(
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
                    onTap: () => ref.read(attackPlayerUseCaseProvider).call(),
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
      ),
    );
  }
}
