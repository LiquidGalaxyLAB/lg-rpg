import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/ui/providers/connection_provider.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/widgets/lobby_players_section.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  final _nameController = TextEditingController(text: 'Player');
  bool _isConnecting = false;
  bool _isStartingGame = false;
  bool _isDisconnecting = false;

  @override
  void initState() {
    super.initState();
    _loadSavedName();
  }

  Future<void> _loadSavedName() async {
    final name = await ref.read(localStorageProvider).getPlayerName();
    if (name != null && name.isNotEmpty && mounted) {
      _nameController.text = name;
    }
  }

  Future<void> _connectToServer() async {
    final host = ref.read(connectionProvider).ip;
    final serverUrl = GameServerConfig.urlForHost(host);
    if (serverUrl.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Enter the Liquid Galaxy IP in Settings and connect before joining a game.'),
        ),
      );
      return;
    }

    setState(() => _isConnecting = true);
    try {
      final name = _nameController.text.trim();
      await ref.read(connectAndJoinLobbyUseCaseProvider).call(
            serverUrl: serverUrl,
            name: name.isEmpty ? 'Player' : name,
          );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to connect to server: $error')),
      );
    } finally {
      if (mounted) setState(() => _isConnecting = false);
    }
  }

  Future<void> _disconnectServer() async {
    setState(() => _isDisconnecting = true);
    try {
      await ref.read(disconnectFromGameServerUseCaseProvider).call();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to disconnect: $error')),
      );
    } finally {
      if (mounted) setState(() => _isDisconnecting = false);
    }
  }

  Future<void> _startGame() async {
    setState(() => _isStartingGame = true);
    try {
      await ref.read(startGameUseCaseProvider).call();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to start game: $error')),
      );
    } finally {
      if (mounted) setState(() => _isStartingGame = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lobbyAsync = ref.watch(lobbyStreamProvider);
    final lobby = lobbyAsync.value;
    final serverConnected =
        ref.watch(gameServerStatusProvider).value?.isConnected ?? false;
    final lgConnected = ref.watch(connectionProvider).isConnected;
    final gameServerRepository = ref.watch(gameServerRepositoryProvider);
    // Whether we've actually joined the lobby, not just connected the socket.
    final inLobby = lobby != null;
    final selectedGameMode = GameMode.values.contains(lobby?.selectedMode)
        ? lobby!.selectedMode
        : GameMode.defaultMode;
    final isHost = lobby?.isHost(gameServerRepository.playerToken) ?? false;
    final playerCount = lobby?.players.length ?? 0;

    // Surface server-side lobby rejections (e.g. "PvP needs at least 2 players").
    ref.listen(lobbyErrorStreamProvider, (_, next) {
      next.whenData((message) {
        if (!mounted || message.isEmpty) return;
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(message)));
      });
    });

    // PvP needs at least 2 players and one on each team (unassigned players get auto-balanced).
    final isPvp = selectedGameMode == GameMode.pvp;
    final myTeam = lobby?.pvpTeams[gameServerRepository.playerToken];
    final teams = lobby?.pvpTeams ?? const <String, String>{};
    final needsMorePlayers = isPvp && playerCount < 2;
    final teamsUnbalanced = isPvp &&
        playerCount >= 2 &&
        teams.length == playerCount &&
        teams.values.toSet().length < 2;
    final canStart =
        isHost && !_isStartingGame && !needsMorePlayers && !teamsUnbalanced;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: const Text('LG RPG'),
        actions: [
          // Only a disconnect action: Connect always does a full reconnect+rejoin, so a separate "leave lobby" buys nothing.
          if (serverConnected)
            IconButton(
              tooltip: 'Disconnect from Game Server',
              icon: _isDisconnecting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.4),
                    )
                  : const Icon(Icons.link_off_rounded, color: AppColors.danger),
              onPressed: _isDisconnecting ? null : _disconnectServer,
            ),
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => ref
                .read(navigationProvider.notifier)
                .setIndex(NavigationIndex.settings),
          ),
        ],
      ),
      body: Container(
        decoration: const BoxDecoration(gradient: AppGradients.heroGlow),
        child: SafeArea(
          top: false,
          // One plain scrolling Column: a fill-remaining-space sliver silently collapsed the lobby list and Play Game to zero height when the content above filled the viewport.
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: StatusPill(
                        active: lgConnected,
                        label: lgConnected ? 'Liquid Galaxy' : 'LG rig',
                        onTap: lgConnected
                            ? null
                            : () => ref
                                .read(navigationProvider.notifier)
                                .setIndex(NavigationIndex.settings),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: StatusPill(
                        active: inLobby,
                        label: inLobby ? 'Game Server' : 'Not in lobby',
                        activeIcon: Icons.dns_rounded,
                        inactiveIcon: Icons.dns_outlined,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _nameController,
                  enabled: !inLobby,
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                    labelText: 'Player Name',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 12),
                AppButton(
                  label: inLobby
                      ? 'Connected'
                      : (_isConnecting ? 'Connecting…' : 'Connect to Server'),
                  icon: inLobby
                      ? Icons.check_rounded
                      : Icons.wifi_tethering_rounded,
                  loading: _isConnecting,
                  onPressed: (lgConnected && !_isConnecting && !inLobby)
                      ? _connectToServer
                      : null,
                ),
                const SizedBox(height: 20),
                const SectionLabel('Game Mode'),
                const SizedBox(height: 10),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: GameMode.pvp,
                      label: Text(GameModeLabel.pvp),
                      icon: Icon(Icons.sports_martial_arts),
                    ),
                    ButtonSegment(
                      value: GameMode.zombie,
                      label: Text(GameModeLabel.zombie),
                      icon: Icon(Icons.crisis_alert),
                    ),
                  ],
                  selected: {selectedGameMode},
                  onSelectionChanged: isHost
                      ? (values) {
                          if (values.isNotEmpty) {
                            ref
                                .read(selectGameModeUseCaseProvider)
                                .call(values.first);
                          }
                        }
                      : null,
                  showSelectedIcon: false,
                ),
                if (!isHost) ...[
                  const SizedBox(height: 6),
                  const Text(
                    'Only the host can change the mode',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.onSurfaceMuted,
                    ),
                  ),
                ],
                if (isPvp && serverConnected) ...[
                  const SizedBox(height: 16),
                  const SectionLabel('Your Team'),
                  const SizedBox(height: 10),
                  SegmentedButton<String>(
                    emptySelectionAllowed: true,
                    segments: const [
                      ButtonSegment(
                        value: PvpTeam.teamA,
                        label: Text('Blue Team'),
                        icon: Icon(Icons.shield_outlined),
                      ),
                      ButtonSegment(
                        value: PvpTeam.teamB,
                        label: Text('Red Team'),
                        icon: Icon(Icons.local_fire_department_outlined),
                      ),
                    ],
                    selected: {if (myTeam != null) myTeam},
                    onSelectionChanged: (values) {
                      if (values.isNotEmpty) {
                        ref.read(selectTeamUseCaseProvider).call(values.first);
                      }
                    },
                    showSelectedIcon: false,
                  ),
                ],
                const SizedBox(height: 20),
                SectionLabel('Lobby · $playerCount'),
                const SizedBox(height: 10),
                SizedBox(
                  height: 240,
                  child: GlassCard(
                    padding: const EdgeInsets.all(12),
                    child: LobbyPlayersSection(
                      lobbyAsync: lobbyAsync,
                      serverConnected: serverConnected,
                      showTeams: isPvp,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                AppButton(
                  label: _isStartingGame
                      ? 'Starting…'
                      : !isHost
                          ? 'Waiting for host to start…'
                          : needsMorePlayers
                              ? 'PvP needs 2+ players'
                              : teamsUnbalanced
                                  ? 'Teams need 1 player each'
                                  : 'Play Game',
                  icon: Icons.play_arrow_rounded,
                  loading: _isStartingGame,
                  onPressed: canStart ? _startGame : null,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
