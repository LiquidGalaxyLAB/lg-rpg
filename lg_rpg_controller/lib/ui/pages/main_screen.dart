import 'dart:math';
import 'package:circular_menu/circular_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/pages/home_page.dart';
import 'package:lg_rpg_controller/ui/pages/inventory_page.dart';
import 'package:lg_rpg_controller/ui/pages/lg_task.dart';
import 'package:lg_rpg_controller/ui/pages/quest_page.dart';
import 'package:lg_rpg_controller/ui/pages/settings_page.dart';
import 'package:lg_rpg_controller/ui/pages/wheel_page.dart';
import '../providers/navigation_provider.dart';

class MainScreen extends ConsumerStatefulWidget {
  const MainScreen({super.key});

  @override
  ConsumerState<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends ConsumerState<MainScreen> {
  final GlobalKey<CircularMenuState> _menuKey = GlobalKey();

  static const List<Widget> _pages = [
    HomePage(),
    LgTask(),
    WheelPage(),
    QuestPage(),
    SettingsPage(),
    InventoryPage(),
  ];

  static const List<String> _pageTitles = [
    'Home',
    'LgTask',
    'Wheel',
    'Quest',
    'Settings',
    'Inventory',
  ];

  @override
  Widget build(BuildContext context) {
    final selectedIndex = ref.watch(navigationProvider);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: selectedIndex != 0
          ? AppBar(
              title: Text(_pageTitles[selectedIndex]),
              centerTitle: true,
              backgroundColor: Colors.transparent,
              elevation: 0,
            )
          : null,
      body: CircularMenu(
        key: _menuKey,
        alignment: Alignment.centerRight, // good for landscape
        radius: 110,
        startingAngleInRadian: 0.5 * pi,
        endingAngleInRadian: 1.5 * pi,
        toggleButtonAnimatedIconData: AnimatedIcons.menu_close,
        toggleButtonColor: Colors.blueGrey,
        toggleButtonIconColor: Colors.white,
        backgroundWidget: _pages[selectedIndex],
        items: [
          CircularMenuItem(
            icon: Icons.home,
            color: const Color.fromARGB(255, 239, 24, 24),
            onTap: () {
              ref.read(navigationProvider.notifier).setIndex(0);
              _menuKey.currentState?.reverseAnimation();
            },
          ),
          CircularMenuItem(
            icon: Icons.assignment,
            color: Colors.teal,
            onTap: () {
              ref.read(navigationProvider.notifier).setIndex(1);
              _menuKey.currentState?.reverseAnimation();
            },
          ),
          CircularMenuItem(
            icon: Icons.circle,
            color: Colors.purple,
            onTap: () {
              ref.read(navigationProvider.notifier).setIndex(2);
              _menuKey.currentState?.reverseAnimation();
            },
          ),
          CircularMenuItem(
            icon: Icons.map,
            color: Colors.orange,
            onTap: () {
              ref.read(navigationProvider.notifier).setIndex(3);
              _menuKey.currentState?.reverseAnimation();
            },
          ),
          CircularMenuItem(
            icon: Icons.settings,
            color: Colors.grey,
            onTap: () {
              ref.read(navigationProvider.notifier).setIndex(4);
              _menuKey.currentState?.reverseAnimation();
            },
          ),
          CircularMenuItem(
            icon: Icons.inventory,
            color: Colors.green,
            onTap: () {
              ref.read(navigationProvider.notifier).setIndex(5);
              _menuKey.currentState?.reverseAnimation();
            },
          ),
        ],
      ),
    );
  }
}
