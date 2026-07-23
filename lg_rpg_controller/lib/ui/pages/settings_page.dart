import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/domain/entities/connection_entity.dart';
import 'package:lg_rpg_controller/ui/providers/connection_provider.dart';
import 'package:lg_rpg_controller/ui/providers/lg_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  late TextEditingController _ipController;
  late TextEditingController _portController;
  late TextEditingController _usernameController;
  late TextEditingController _passwordController;
  late TextEditingController _screenNumberController;

  bool _isConnecting = false;
  bool _isServerBusy = false;
  bool _isBrowserBusy = false;

  /// Which browser action is in flight (`true` = launching), so only the tapped button shows a spinner.
  bool? _browserBusyOpen;

  /// Whether the fields have been seeded from the persisted profile yet.
  bool _fieldsInitialized = false;

  @override
  void initState() {
    super.initState();
    _ipController = TextEditingController();
    _portController = TextEditingController(text: '22');
    _usernameController = TextEditingController(text: "lg");
    _passwordController = TextEditingController(text: "lg");
    _screenNumberController = TextEditingController(text: "3");
  }

  /// Seeds the text fields from the saved profile once, so persisted settings aren't replaced by the hardcoded defaults.
  void _seedFieldsFromSettings(ConnectionEntity conn) {
    if (_fieldsInitialized) return;
    if (conn.ip.isEmpty) {
      // No full profile saved, but a screen count chosen before the first successful connect may have loaded; seed only while the field still holds its untouched default so the user's typing is never replaced.
      if (conn.screenNumber != 3 && _screenNumberController.text == '3') {
        _screenNumberController.text = conn.screenNumber.toString();
      }
      return;
    }
    _fieldsInitialized = true;
    _ipController.text = conn.ip;
    _portController.text = conn.port.toString();
    _usernameController.text = conn.username;
    _passwordController.text = conn.password;
    _screenNumberController.text = conn.screenNumber.toString();
  }

  @override
  void dispose() {
    _ipController.dispose();
    _portController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    _screenNumberController.dispose();
    super.dispose();
  }

  void _snack(String message) {
    if (!mounted) return;
    showAppSnack(context, message);
  }

  Future<void> _connect() async {
    // Parse leniently so an empty/typo'd field falls back to a sane default instead of a cryptic connect error.
    final port = int.tryParse(_portController.text.trim()) ?? 22;
    final screens = int.tryParse(_screenNumberController.text.trim()) ?? 3;
    final safeScreens = screens < 1 ? 1 : screens;
    // Keep the field in sync if we clamped/defaulted it.
    _screenNumberController.text = safeScreens.toString();
    _portController.text = port.toString();

    setState(() => _isConnecting = true);
    try {
      final notifier = ref.read(connectionProvider.notifier);
      notifier.setIp(_ipController.text.trim());
      notifier.setPort(port);
      notifier.setUsername(_usernameController.text.trim());
      notifier.setPassword(_passwordController.text);
      await notifier.setScreenNumber(safeScreens);
      await notifier.connect();
      _snack('Connected to Liquid Galaxy');
    } catch (e) {
      _snack('Failed to connect: $e');
    } finally {
      if (mounted) setState(() => _isConnecting = false);
    }
  }

  Future<void> _disconnect() async {
    await ref.read(connectionProvider.notifier).disconnect();
    // The SSH session is gone, so server/browser state no longer holds.
    ref.read(serverRunningProvider.notifier).state = false;
    ref.read(browserOpenProvider.notifier).state = false;
    _snack('Disconnected');
  }

  Future<void> _runServer({required bool start}) async {
    setState(() => _isServerBusy = true);
    final repo = ref.read(lgRepositoryProvider);
    try {
      if (start) {
        await repo.startServer();
      } else {
        await repo.stopServer();
      }
      ref.read(serverRunningProvider.notifier).state = start;
      _snack(start ? 'Server started' : 'Server stopped');
    } catch (e) {
      _snack('Server action failed: $e');
    } finally {
      if (mounted) setState(() => _isServerBusy = false);
    }
  }

  Future<void> _runBrowser({required bool open}) async {
    setState(() {
      _isBrowserBusy = true;
      _browserBusyOpen = open;
    });
    final repo = ref.read(lgRepositoryProvider);
    try {
      if (open) {
        await repo.launchBrowser();
      } else {
        await repo.closeBrowser();
      }
      ref.read(browserOpenProvider.notifier).state = open;
      _snack(open ? 'Browser launched' : 'Browser closed');
    } catch (e) {
      _snack('Browser action failed: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isBrowserBusy = false;
          _browserBusyOpen = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final connection = ref.watch(connectionProvider);
    final connected = connection.isConnected;
    final serverRunning = ref.watch(serverRunningProvider);

    _seedFieldsFromSettings(connection);

    Widget field(TextEditingController c, String label, String hint,
        {bool number = false, bool obscure = false, IconData? icon}) {
      return TextField(
        controller: c,
        obscureText: obscure,
        keyboardType: number ? TextInputType.number : null,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          prefixIcon: icon != null ? Icon(icon) : null,
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ref
              .read(navigationProvider.notifier)
              .setIndex(NavigationIndex.home),
        ),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            MediaQuery.of(context).viewInsets.bottom + 24,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              StatusPill(
                active: connected,
                label:
                    connected ? 'Connected to Liquid Galaxy' : 'Not connected',
              ),
              const SizedBox(height: 18),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SectionLabel('Liquid Galaxy Rig'),
                    const SizedBox(height: 14),
                    field(_ipController, 'IP Address', '192.168.0.1',
                        number: true, icon: Icons.lan_outlined),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: field(_portController, 'Port', '22',
                              number: true),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: field(_screenNumberController, 'Screens', '3',
                              number: true),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: field(_usernameController, 'Username', 'lg'),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: field(_passwordController, 'Password', 'lg',
                              obscure: true),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              AppButton(
                label: connected
                    ? 'Connected'
                    : (_isConnecting ? 'Connecting…' : 'Connect'),
                icon: connected ? Icons.check_rounded : Icons.link_rounded,
                loading: _isConnecting,
                onPressed: (connected || _isConnecting) ? null : _connect,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Disconnect',
                icon: Icons.link_off_rounded,
                variant: AppButtonVariant.tonal,
                onPressed: connected ? _disconnect : null,
              ),
              const SizedBox(height: 26),
              const SectionLabel('Game Server'),
              const SizedBox(height: 12),
              AppButton(
                label: 'Start the Server',
                icon: Icons.play_circle_outline_rounded,
                variant: AppButtonVariant.tonal,
                loading: _isServerBusy && !serverRunning,
                onPressed: (connected && !serverRunning && !_isServerBusy)
                    ? () => _runServer(start: true)
                    : null,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Stop the Server',
                icon: Icons.stop_circle_outlined,
                variant: AppButtonVariant.danger,
                loading: _isServerBusy && serverRunning,
                onPressed: (connected && serverRunning && !_isServerBusy)
                    ? () => _runServer(start: false)
                    : null,
              ),
              const SizedBox(height: 26),
              const SectionLabel('Display'),
              const SizedBox(height: 12),
              AppButton(
                label: 'Launch Browser',
                icon: Icons.open_in_browser_rounded,
                variant: AppButtonVariant.tonal,
                loading: _isBrowserBusy && _browserBusyOpen == true,
                onPressed: (connected && serverRunning && !_isBrowserBusy)
                    ? () => _runBrowser(open: true)
                    : null,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Close Browser',
                icon: Icons.cancel_presentation_rounded,
                variant: AppButtonVariant.danger,
                loading: _isBrowserBusy && _browserBusyOpen == false,
                onPressed: (connected && serverRunning && !_isBrowserBusy)
                    ? () => _runBrowser(open: false)
                    : null,
              ),
              const SizedBox(height: 26),
              const SectionLabel('Liquid Galaxy'),
              const SizedBox(height: 12),
              AppButton(
                label: 'LG Tasks',
                icon: Icons.build_circle_outlined,
                variant: AppButtonVariant.tonal,
                onPressed: () => ref
                    .read(navigationProvider.notifier)
                    .setIndex(NavigationIndex.lgTask),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
