import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
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
    // A tied PvP round arrives as a 'draw' outcome (server sends winner: null).
    final draw = result?.isDraw ?? false;
    // PvP outcome is a team win/loss, not personal survival, so skip the "You Died"/"Survived Xs" framing.
    final isPvp = ref.watch(currentMatchModeProvider) == GameMode.pvp;
    final title = draw
        ? 'Draw'
        : won
            ? (isPvp ? 'Victory!' : 'You Survived!')
            : (isPvp ? 'Defeat' : 'You Died');
    final subtitle = isPvp
        ? 'Round Over'
        : 'Survived ${_formatClock(result?.survivedMs ?? 0)}';
    final color = draw
        ? const Color(0xFFFFC94D)
        : won
            ? const Color(0xFF4DD964)
            : const Color(0xFFFF5555);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                draw
                    ? Icons.handshake_rounded
                    : won
                        ? Icons.emoji_events
                        : Icons.sentiment_very_dissatisfied,
                size: 72,
                color: color,
              ),
              const SizedBox(height: 24),
              Text(
                title,
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                subtitle,
                style: const TextStyle(fontSize: 16, color: Colors.white70),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
