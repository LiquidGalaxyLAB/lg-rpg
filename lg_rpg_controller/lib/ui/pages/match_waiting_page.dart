import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

class MatchWaitingPage extends ConsumerWidget {
  const MatchWaitingPage({super.key});

  Future<void> _leaveMatch(WidgetRef ref) async {
    await ref.read(leaveLobbyUseCaseProvider).call();
    ref.read(navigationProvider.notifier).setIndex(NavigationIndex.home);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppGradients.heroGlow),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.surfaceHigh,
                    border: Border.all(color: AppColors.border),
                  ),
                  child: const Icon(Icons.hourglass_top_rounded,
                      size: 44, color: AppColors.primaryBright),
                ),
                const SizedBox(height: 28),
                Text(
                  'YOU ARE OUT',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Waiting for the match to end…',
                  style:
                      TextStyle(fontSize: 16, color: AppColors.onSurfaceMuted),
                ),
                const SizedBox(height: 32),
                const SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(strokeWidth: 2.6),
                ),
                const SizedBox(height: 40),
                SizedBox(
                  width: 200,
                  child: AppButton(
                    label: 'Leave Match',
                    icon: Icons.exit_to_app_rounded,
                    variant: AppButtonVariant.tonal,
                    onPressed: () => _leaveMatch(ref),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
