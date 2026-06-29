import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/pages/main_screen.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';

void main() async {
  runApp(
    const ProviderScope(
      child: LgRPG(),
    ),
  );
}

class LgRPG extends StatelessWidget {
  const LgRPG({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      home: const MainScreen(),
    );
  }
}
