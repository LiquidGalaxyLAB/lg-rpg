import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/providers/lg_providers.dart';
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
    setState(() => _isConnecting = true);
    try {
      final name = _nameController.text.trim();
      await ref.read(connectAndJoinLobbyUseCaseProvider).call(
            serverUrl: GameServerConfig.url,
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
      await ref.read(launchBrowserUseCaseProvider).call();
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
