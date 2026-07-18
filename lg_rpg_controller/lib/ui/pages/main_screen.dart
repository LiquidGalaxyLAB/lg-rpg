import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/ui/pages/controller_page.dart';
import 'package:lg_rpg_controller/ui/pages/home_page.dart';
import 'package:lg_rpg_controller/ui/pages/lg_task.dart';
import 'package:lg_rpg_controller/ui/pages/match_waiting_page.dart';
import 'package:lg_rpg_controller/ui/pages/match_result_page.dart';
import 'package:lg_rpg_controller/ui/pages/settings_page.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import '../providers/navigation_provider.dart';

class MainScreen extends ConsumerWidget {
  const MainScreen({super.key});

  // Pages indexed by NavigationIndex; each owns its own Scaffold, the shell just swaps the body.
  static const List<Widget> _pages = [
    HomePage(),
    SettingsPage(),
    ControllerPage(),
    MatchWaitingPage(),
    MatchResultPage(),
    LgTask(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedIndex = ref.watch(navigationProvider);

    // Match starts: jump to the controls. GAME_STARTED is a server-wide broadcast, so ignore it if we've left the lobby.
    ref.listen(gameStartedStreamProvider, (_, next) {
      next.whenData((result) {
        if (ref.read(gameServerRepositoryProvider).currentLobby == null) {
          return;
        }
        ref.read(currentMatchModeProvider.notifier).state = result.selectedMode;
        ref
            .read(navigationProvider.notifier)
            .setIndex(NavigationIndex.controller);
      });
    });

    // Death routes to the waiting screen only in Zombie (permadeath); PvP handles its short "downed" respawn in place on ControllerPage.
    ref.listen(playerDiedStreamProvider, (_, next) {
      next.whenData((_) {
        if (ref.read(gameServerRepositoryProvider).currentLobby == null) {
          return;
        }
        if (ref.read(currentMatchModeProvider) == GameMode.pvp) return;
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
        if (ref.read(gameServerRepositoryProvider).currentLobby == null) {
          return;
        }
        ref.read(lastGameResultProvider.notifier).state = result;
        ref
            .read(navigationProvider.notifier)
            .setIndex(NavigationIndex.matchResult);
      });
    });

    return _pages[selectedIndex];
  }
}
