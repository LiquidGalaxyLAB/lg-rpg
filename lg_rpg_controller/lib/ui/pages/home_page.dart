import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/ui/providers/connection_provider.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/widgets/lobby_players_section.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  final _nameController = TextEditingController(text: 'Player');
  bool _isConnecting = false;
  bool _isStartingGame = false;
  // PvP is temporarily disabled. Guards the auto-select so we emit the
  // switch-to-zombie request once per pvp lobby, not every rebuild.
  bool _zombieForceRequested = false;

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
    final lgIp = ref.read(connectionProvider).ip;
    final serverUrl = GameServerConfig.urlForHost(lgIp);
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
      // Only start the match. The LG displays are launched separately from
      // Settings so the screens are already up (Phaser loaded) before the
      // action begins, and we don't stack a new Chromium kiosk every round.
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
    final gameServerRepository = ref.watch(gameServerRepositoryProvider);
    final selectedGameMode = GameMode.values.contains(lobby?.selectedMode)
        ? lobby!.selectedMode
        : GameMode.defaultMode;
    final isHost = lobby?.isHost(gameServerRepository.playerToken) ?? false;

    // PvP is temporarily disabled

    if (isHost && lobby != null && lobby.selectedMode == GameMode.pvp) {
      if (!_zombieForceRequested) {
        _zombieForceRequested = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          ref.read(selectGameModeUseCaseProvider).call(GameMode.zombie);
        });
      }
    } else {
      _zombieForceRequested = false;
    }
    // Never show pvp as the active selection while it's disabled.
    final displayMode =
        selectedGameMode == GameMode.pvp ? GameMode.zombie : selectedGameMode;

    return Scaffold(
      appBar: AppBar(title: const Text('LG RPG'), centerTitle: true),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Player Name',
                  prefixIcon: Icon(Icons.person),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _isConnecting ? null : _connectToServer,
                child:
                    Text(_isConnecting ? 'Connecting...' : 'Connect to Server'),
              ),
              const SizedBox(height: 16),
              Column(
                children: [
                  const Text('Game Mode',
                      style: TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w700)),
                  SegmentedButton<String>(
                    segments: const [
                      // PvP is temporarily disabled until its mode logic lands.
                      ButtonSegment(
                        value: GameMode.pvp,
                        label: Text('${GameModeLabel.pvp} (soon)'),
                        icon: Icon(Icons.sports_martial_arts),
                        enabled: false,
                      ),
                      ButtonSegment(
                        value: GameMode.zombie,
                        label: Text(GameModeLabel.zombie),
                        icon: Icon(Icons.crisis_alert),
                      ),
                    ],
                    selected: {displayMode},
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
                  )
                ],
              ),

              // --- Status ---
              if (_isConnecting)
                const Expanded(
                    child: Center(child: CircularProgressIndicator()))
              else ...[
                LobbyPlayersSection(lobbyAsync: lobbyAsync),
                const SizedBox(height: 16),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: isHost && !_isStartingGame ? _startGame : null,
                  child: Text(
                    _isStartingGame ? 'Starting...' : 'Play Game',
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
