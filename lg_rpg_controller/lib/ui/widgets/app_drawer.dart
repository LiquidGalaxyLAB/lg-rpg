import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/ui/providers/theme_provider.dart';
import 'package:lg_rpg_controller/ui/widgets/sprite_sheet.dart';

/// Left navigation drawer (hamburger) for the top-level pages; pages swap through [navigationProvider], so the drawer just sets the index.
class AppDrawer extends ConsumerWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final current = ref.watch(navigationProvider);
    // Portrait follows whichever character the player has picked on Loadout.
    final character =
        CharacterCatalog.byId(ref.watch(selectedCharacterProvider));

    void go(int index) {
      Navigator.of(context).pop(); // close the drawer first
      ref.read(navigationProvider.notifier).setIndex(index);
    }

    return Drawer(
      backgroundColor: p.bg,
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: p.surfaceHigh,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: p.border),
                    ),
                    child: character.idleSprite != null
                        ? AnimatedSprite(
                            character.idleSprite!.asset,
                            size: 64,
                            frameCount: character.idleSprite!.frames,
                            fps: 8,
                            zoom: 1.7,
                            dy: -0.1,
                          )
                        : SizedBox(
                            width: 64,
                            height: 64,
                            child: Center(
                              child: Text(character.basicIcon,
                                  style: const TextStyle(fontSize: 40)),
                            ),
                          ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'LG RPG',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Playing as ${character.displayName}',
                          style: TextStyle(
                            color: p.onSurfaceMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(),
            const SizedBox(height: 8),
            _DrawerItem(
              icon: Icons.home_rounded,
              label: 'Home',
              selected: current == NavigationIndex.home,
              onTap: () => go(NavigationIndex.home),
            ),
            _DrawerItem(
              icon: Icons.backpack_outlined,
              label: 'Loadout',
              selected: current == NavigationIndex.inventory,
              onTap: () => go(NavigationIndex.inventory),
            ),
            _DrawerItem(
              icon: Icons.public_rounded,
              label: 'Map',
              selected: current == NavigationIndex.map,
              onTap: () => go(NavigationIndex.map),
            ),
            _DrawerItem(
              icon: Icons.build_circle_outlined,
              label: 'LG Tasks',
              selected: current == NavigationIndex.lgTask,
              onTap: () => go(NavigationIndex.lgTask),
            ),
            _DrawerItem(
              icon: Icons.settings_outlined,
              label: 'Settings',
              selected: current == NavigationIndex.settings,
              onTap: () => go(NavigationIndex.settings),
            ),
            _DrawerItem(
              icon: Icons.info_outline_rounded,
              label: 'About',
              selected: current == NavigationIndex.about,
              onTap: () => go(NavigationIndex.about),
            ),
            const Spacer(),
            const Divider(),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 14, 20, 10),
              child: _ThemeToggle(),
            ),
          ],
        ),
      ),
    );
  }
}

/// Appearance switch: System / Light / Dark, persisted across launches.
class _ThemeToggle extends ConsumerWidget {
  const _ThemeToggle();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;
    final mode = ref.watch(themeModeProvider);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'APPEARANCE',
          style: TextStyle(
            color: p.onSurfaceMuted,
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: p.surfaceHigh,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: p.border),
          ),
          child: Row(
            children: [
              for (final entry in const {
                ThemeMode.system: Icons.brightness_auto_rounded,
                ThemeMode.light: Icons.light_mode_rounded,
                ThemeMode.dark: Icons.dark_mode_rounded,
              }.entries)
                Expanded(
                  child: _ThemeChoice(
                    icon: entry.value,
                    selected: mode == entry.key,
                    onTap: () =>
                        ref.read(themeModeProvider.notifier).set(entry.key),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ThemeChoice extends StatelessWidget {
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ThemeChoice({
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: selected ? p.primary.withValues(alpha: 0.18) : Colors.transparent,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected
                  ? p.primary.withValues(alpha: 0.6)
                  : Colors.transparent,
            ),
          ),
          child: Icon(
            icon,
            size: 20,
            color: selected ? p.primaryBright : p.onSurfaceMuted,
          ),
        ),
      ),
    );
  }
}

class _DrawerItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _DrawerItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final color = selected ? p.primaryBright : p.onSurface;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: selected ? p.surfaceHigh : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            child: Row(
              children: [
                Icon(icon, size: 22, color: color),
                const SizedBox(width: 14),
                Text(
                  label,
                  style: TextStyle(
                    color: color,
                    fontSize: 15,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
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
