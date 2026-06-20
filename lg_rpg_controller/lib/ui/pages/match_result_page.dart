import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';

class MatchResultPage extends ConsumerStatefulWidget {
  const MatchResultPage({super.key});

  @override
  ConsumerState<MatchResultPage> createState() => _MatchResultPageState();
}

class _MatchResultPageState extends ConsumerState<MatchResultPage> {
  static const _lingerSeconds = 6;
  Timer? _returnTimer;

  @override
  void initState() {
    super.initState();
    // Linger on the result, then return to Home for the next round.
    _returnTimer = Timer(const Duration(seconds: _lingerSeconds), () {
      if (!mounted) return;
      ref.read(navigationProvider.notifier).setIndex(NavigationIndex.home);
    });
  }

  @override
  void dispose() {
    _returnTimer?.cancel();
    super.dispose();
  }

  String _formatClock(int ms) {
    final total = (ms / 1000).floor();
    final m = total ~/ 60;
    final s = total % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final result = ref.watch(lastGameResultProvider);
    final won = result?.isWin ?? false;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                won ? Icons.emoji_events : Icons.sentiment_very_dissatisfied,
                size: 72,
                color: won ? const Color(0xFF4DD964) : const Color(0xFFFF5555),
              ),
              const SizedBox(height: 24),
              Text(
                won ? 'You Survived!' : 'You Died',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color:
                      won ? const Color(0xFF4DD964) : const Color(0xFFFF5555),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Survived ${_formatClock(result?.survivedMs ?? 0)}',
                style: const TextStyle(fontSize: 16, color: Colors.white70),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
