import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/pages/controller_page.dart';
import 'package:lg_rpg_controller/ui/pages/home_page.dart';
import 'package:lg_rpg_controller/ui/pages/match_waiting_page.dart';
import 'package:lg_rpg_controller/ui/pages/match_result_page.dart';
import 'package:lg_rpg_controller/ui/pages/settings_page.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import '../providers/navigation_provider.dart';

class MainScreen extends ConsumerWidget {
  const MainScreen({super.key});

  // Indexed by NavigationIndex. Each page owns its own Scaffold/AppBar, so the
  // shell just swaps the body. Navigation between hub pages is driven by the
  // AppBar settings cog (Home -> Settings) and back arrow; the immersive game
  // pages are reached automatically by the listeners below.
  static const List<Widget> _pages = [
    HomePage(),
    SettingsPage(),
    ControllerPage(),
    MatchWaitingPage(),
    MatchResultPage(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedIndex = ref.watch(navigationProvider);

    // Match starts: jump to the controls.
    ref.listen(gameStartedStreamProvider, (_, next) {
      next.whenData((_) {
        ref
            .read(navigationProvider.notifier)
            .setIndex(NavigationIndex.controller);
      });
    });

    ref.listen(playerDiedStreamProvider, (_, next) {
      next.whenData((_) {
        ref
            .read(navigationProvider.notifier)
            .setIndex(NavigationIndex.matchWaiting);
      });
    });

    // PvP respawn: bring the player back to the controls after the down timer.
    ref.listen(playerRespawnedStreamProvider, (_, next) {
      next.whenData((_) {
        ref
            .read(navigationProvider.notifier)
            .setIndex(NavigationIndex.controller);
      });
    });

    ref.listen(gameOverStreamProvider, (_, next) {
      next.whenData((result) {
        ref.read(lastGameResultProvider.notifier).state = result;
        ref
            .read(navigationProvider.notifier)
            .setIndex(NavigationIndex.matchResult);
      });
    });

    return _pages[selectedIndex];
  }
}
