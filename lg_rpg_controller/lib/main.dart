import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/pages/main_screen.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/providers/theme_provider.dart';

void main() async {
  runApp(
    const ProviderScope(
      child: LgRPG(),
    ),
  );
}

class LgRPG extends ConsumerWidget {
  const LgRPG({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      home: const MainScreen(),
    );
  }
}
