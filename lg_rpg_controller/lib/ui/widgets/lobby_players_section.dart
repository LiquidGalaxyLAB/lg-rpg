import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/entities/player_entity.dart';

class LobbyPlayersSection extends StatelessWidget {
  final AsyncValue<LobbyEntity?> lobbyAsync;

  const LobbyPlayersSection({
    super.key,
    required this.lobbyAsync,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: lobbyAsync.when(
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
      ),
    );
  }
}

class _LobbyPlayersList extends StatelessWidget {
  final LobbyEntity? lobby;

  const _LobbyPlayersList({required this.lobby});

  @override
  Widget build(BuildContext context) {
    final players = lobby?.players ?? const <PlayerEntity>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Players in Lobby (${players.length})',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: players.isEmpty
              ? const _LobbyMessage(
                  icon: Icons.groups_outlined,
                  message: 'Waiting for players...',
                )
              : ListView.builder(
                  itemCount: players.length,
                  itemBuilder: (_, index) {
                    final player = players[index];
                    return _PlayerLobbyTile(
                      key: ValueKey(player.id),
                      player: player,
                      isHost: lobby?.isHost(player.id) ?? false,
                    );
                  },
                ),
        ),
      ],
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
    return ListTile(
      leading: CircleAvatar(child: Text(_initial)),
      title: Text(player.name),
      subtitle: Text(isHost ? 'Host' : 'Player'),
      trailing: player.isReady
          ? const Icon(Icons.check_circle, color: Colors.green)
          : const Icon(Icons.hourglass_empty, color: Colors.orange),
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
            Icon(icon, color: Colors.grey),
            const SizedBox(height: 8),
            Text(message, style: const TextStyle(color: Colors.grey)),
            if (detail != null) ...[
              const SizedBox(height: 4),
              Text(
                detail!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
