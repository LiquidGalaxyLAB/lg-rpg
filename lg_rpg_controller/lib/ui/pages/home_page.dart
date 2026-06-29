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

    // PvP is team-vs-team, so the host can't start it solo.
    final needsMorePlayers =
        selectedGameMode == GameMode.pvp && playerCount < 2;
    final canStart = isHost && !_isStartingGame && !needsMorePlayers;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      appBar: AppBar(
        title: const Text('LG RPG'),
        actions: [
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
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                StatusPill(
                  active: lgConnected,
                  label: lgConnected
                      ? 'Connected to Liquid Galaxy'
                      : 'Not connected · Tap to open Settings',
                  onTap: lgConnected
                      ? null
                      : () => ref
                          .read(navigationProvider.notifier)
                          .setIndex(NavigationIndex.settings),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _nameController,
                  textInputAction: TextInputAction.done,
                  decoration: const InputDecoration(
                    labelText: 'Player Name',
                    prefixIcon: Icon(Icons.person_outline),
                  ),
                ),
                const SizedBox(height: 14),
                AppButton(
                  label: _isConnecting ? 'Connecting…' : 'Connect to Server',
                  icon: Icons.wifi_tethering_rounded,
                  loading: _isConnecting,
                  onPressed:
                      (lgConnected && !_isConnecting) ? _connectToServer : null,
                ),
                const SizedBox(height: 24),
                const SectionLabel('Game Mode'),
                const SizedBox(height: 10),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: GameMode.pvp,
                      label: Text('${GameModeLabel.pvp} (Soon)'),
                      icon: Icon(Icons.sports_martial_arts),
                      enabled: false,
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
                const SizedBox(height: 24),
                SectionLabel('Lobby · $playerCount'),
                const SizedBox(height: 10),
                Expanded(
                  child: GlassCard(
                    padding: const EdgeInsets.all(12),
                    child: LobbyPlayersSection(
                      lobbyAsync: lobbyAsync,
                      serverConnected: serverConnected,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                AppButton(
                  label: _isStartingGame
                      ? 'Starting…'
                      : needsMorePlayers
                          ? 'PvP needs 2+ players'
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
