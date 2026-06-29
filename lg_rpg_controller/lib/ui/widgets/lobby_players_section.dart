import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/entities/player_entity.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';

class LobbyPlayersSection extends StatelessWidget {
  final AsyncValue<LobbyEntity?> lobbyAsync;
  final bool serverConnected;

  const LobbyPlayersSection({
    super.key,
    required this.lobbyAsync,
    this.serverConnected = false,
  });

  @override
  Widget build(BuildContext context) {
    if (!serverConnected) {
      return const _LobbyMessage(
        icon: Icons.cloud_off_rounded,
        message: 'Not connected to a game server',
        detail: 'Tap "Connect to Server" to load the lobby.',
      );
    }

    return lobbyAsync.when(
      loading: () => const _LobbyMessage(
        icon: Icons.sync,
        message: 'Loading lobby...',
      ),
      error: (error, _) => _LobbyMessage(
        icon: Icons.error_outline,
        message: 'Could not load lobby',
        detail: error.toString(),
      ),
      data: (lobby) => _LobbyPlayersList(lobby: lobby),
    );
  }
}

class _LobbyPlayersList extends StatelessWidget {
  final LobbyEntity? lobby;

  const _LobbyPlayersList({required this.lobby});

  @override
  Widget build(BuildContext context) {
    final players = lobby?.players ?? const <PlayerEntity>[];

    if (players.isEmpty) {
      return const _LobbyMessage(
        icon: Icons.groups_outlined,
        message: 'Waiting for players to join…',
      );
    }

    return ListView.separated(
      padding: EdgeInsets.zero,
      itemCount: players.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, index) {
        final player = players[index];
        return _PlayerLobbyTile(
          key: ValueKey(player.id),
          player: player,
          isHost: lobby?.isHost(player.id) ?? false,
        );
      },
    );
  }
}

class _PlayerLobbyTile extends StatelessWidget {
  final PlayerEntity player;
  final bool isHost;

  const _PlayerLobbyTile({
    super.key,
    required this.player,
    required this.isHost,
  });

  @override
  Widget build(BuildContext context) {
    final ready = player.isReady;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceHigh,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              gradient: AppGradients.primary,
              shape: BoxShape.circle,
            ),
            child: Text(
              _initial,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  player.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.onSurface,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                ),
                Text(
                  isHost ? 'Host' : 'Player',
                  style: TextStyle(
                    color: isHost
                        ? AppColors.primaryBright
                        : AppColors.onSurfaceMuted,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            ready ? Icons.check_circle_rounded : Icons.hourglass_top_rounded,
            color: ready ? AppColors.success : AppColors.warning,
            size: 22,
          ),
        ],
      ),
    );
  }

  String get _initial {
    final trimmedName = player.name.trim();
    return trimmedName.isEmpty ? '?' : trimmedName[0].toUpperCase();
  }
}

class _LobbyMessage extends StatelessWidget {
  final IconData icon;
  final String message;
  final String? detail;

  const _LobbyMessage({
    required this.icon,
    required this.message,
    this.detail,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: AppColors.onSurfaceMuted, size: 30),
            const SizedBox(height: 10),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.onSurfaceMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (detail != null) ...[
              const SizedBox(height: 4),
              Text(
                detail!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: AppColors.onSurfaceMuted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
