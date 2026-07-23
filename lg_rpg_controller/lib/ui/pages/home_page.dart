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
import 'package:lg_rpg_controller/ui/widgets/app_drawer.dart';

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

  void _snack(String message) {
    if (!mounted) return;
    showAppSnack(context, message);
  }

  /// Runs [action] with [setBusy] flipped around it, surfacing failures as "[failure]: error".
  Future<void> _runBusy(
    void Function(bool) setBusy,
    Future<void> Function() action,
    String failure,
  ) async {
    setState(() => setBusy(true));
    try {
      await action();
    } catch (error) {
      _snack('$failure: $error');
    } finally {
      if (mounted) setState(() => setBusy(false));
    }
  }

  Future<void> _connectToServer() async {
    final host = ref.read(connectionProvider).ip;
    final serverUrl = GameServerConfig.urlForHost(host);
    if (serverUrl.isEmpty) {
      _snack(
          'Enter the Liquid Galaxy IP in Settings and connect before joining a game.');
      return;
    }

    await _runBusy((b) => _isConnecting = b, () {
      final name = _nameController.text.trim();
      return ref.read(connectAndJoinLobbyUseCaseProvider).call(
            serverUrl: serverUrl,
            name: name.isEmpty ? 'Player' : name,
          );
    }, 'Failed to connect to server');
  }

  Future<void> _disconnectServer() => _runBusy(
        (b) => _isDisconnecting = b,
        () => ref.read(disconnectFromGameServerUseCaseProvider).call(),
        'Failed to disconnect',
      );

  Future<void> _startGame() => _runBusy(
        (b) => _isStartingGame = b,
        () => ref.read(startGameUseCaseProvider).call(),
        'Failed to start game',
      );

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
        if (message.isNotEmpty) _snack(message);
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
      // Let the body's glow run behind the transparent app bar; otherwise the bar sits as a flat dark strip above where the gradient starts.
      extendBodyBehindAppBar: true,
      // Hamburger on the left opens the navigation drawer (Loadout, LG Tasks…).
      drawer: const AppDrawer(),
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
                  : Icon(Icons.link_off_rounded, color: context.palette.danger),
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
        decoration: BoxDecoration(gradient: context.palette.heroGlow),
        child: SafeArea(
          top: false,
          // One plain scrolling Column: a fill-remaining-space sliver silently collapsed the lobby list and Play Game to zero height when the content above filled the viewport.
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              20,
              MediaQuery.of(context).padding.top + kToolbarHeight + 8,
              20,
              20,
            ),
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
                if (inLobby && !isHost) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Only the host can change the mode',
                    style: TextStyle(
                      fontSize: 12,
                      color: context.palette.onSurfaceMuted,
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
                  // Shorter when there's nobody to list, so an idle lobby isn't a void — but tall enough for the empty-state message.
                  height: playerCount > 0 ? 240 : 156,
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
                  // Check inLobby before isHost: with no lobby, isHost is false by default, which otherwise blames a host that doesn't exist.
                  label: _isStartingGame
                      ? 'Starting…'
                      : !inLobby
                          ? 'Connect to a server to play'
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
