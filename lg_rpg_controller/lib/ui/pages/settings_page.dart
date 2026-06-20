import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/providers/connection_provider.dart';
import 'package:lg_rpg_controller/ui/providers/lg_providers.dart';

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

  @override
  void initState() {
    super.initState();
    _ipController = TextEditingController();
    _portController = TextEditingController(text: '22');
    _usernameController = TextEditingController(text: "lg");
    _passwordController = TextEditingController(text: "lg");
    _screenNumberController = TextEditingController(text: "3");
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

  @override
  Widget build(BuildContext context) {
    final connectionState = ref.watch(connectionProvider);
    final lgRepositoryState = ref.watch(lgRepositoryProvider);

    InputDecoration fieldDecoration(String label, String hint) {
      return InputDecoration(
        labelText: label,
        hintText: hint,
        isDense: true,
        border: const OutlineInputBorder(),
        contentPadding:
            const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
      );
    }

    Widget fieldRow(Widget left, Widget right) {
      return Row(
        children: [
          Expanded(child: left),
          const SizedBox(width: 16),
          Expanded(child: right),
        ],
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Enter Details'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            24,
            24,
            24,
            MediaQuery.of(context).viewInsets.bottom + 24,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // --- FORM SECTION ---
              TextField(
                controller: _ipController,
                keyboardType: TextInputType.number,
                decoration: fieldDecoration('IP Address', '192.34.4.0'),
              ),
              const SizedBox(height: 16),
              fieldRow(
                TextField(
                  controller: _portController,
                  keyboardType: TextInputType.number,
                  decoration: fieldDecoration('Port', '22'),
                ),
                TextField(
                  controller: _screenNumberController,
                  keyboardType: TextInputType.number,
                  decoration: fieldDecoration('Screen Number', '3'),
                ),
              ),
              const SizedBox(height: 16),
              fieldRow(
                TextField(
                  controller: _usernameController,
                  decoration: fieldDecoration('Username', 'lg'),
                ),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: fieldDecoration('Password', 'lg'),
                ),
              ),

              const SizedBox(height: 48),

              // --- BUTTONS SECTION ---
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onPressed: connectionState.isConnected
                    ? null
                    : () async {
                        final notifier = ref.read(connectionProvider.notifier);
                        notifier.setIp(_ipController.text);
                        notifier.setPort(int.parse(_portController.text));
                        notifier.setUsername(_usernameController.text);
                        notifier.setPassword(_passwordController.text);
                        await notifier.setScreenNumber(
                          int.parse(_screenNumberController.text),
                        );
                        if (!context.mounted) return;
                        try {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('Connecting to Liquid Galaxy')),
                          );

                          await notifier.connect();
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                                content: Text('Connected successfully!')),
                          );
                        } catch (e) {
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Failed to connect: $e')),
                          );
                        }
                      },
                child: const Text('Connect'),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onPressed: !connectionState.isConnected
                    ? null
                    : () async {
                        await ref
                            .read(connectionProvider.notifier)
                            .disconnect();
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Disconnected!')),
                        );
                      },
                child: const Text('Disconnect'),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onPressed: !connectionState.isConnected
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        messenger.showSnackBar(
                          const SnackBar(
                              content: Text('Starting server…'),
                              duration: Duration(seconds: 12)),
                        );
                        try {
                          await lgRepositoryState.startServer();
                          messenger.hideCurrentSnackBar();
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Server Started!')),
                          );
                        } catch (e) {
                          messenger.hideCurrentSnackBar();
                          messenger.showSnackBar(
                            SnackBar(
                                content: Text('Failed to start server: $e')),
                          );
                        }
                      },
                child: const Text('Start the Server'),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: Colors.red.shade100, // Visual cue for stop
                  foregroundColor: Colors.red.shade900,
                ),
                onPressed: !connectionState.isConnected
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          await lgRepositoryState.stopServer();
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Server Stopped!')),
                          );
                        } catch (e) {
                          messenger.showSnackBar(
                            SnackBar(
                                content: Text('Failed to stop server: $e')),
                          );
                        }
                      },
                child: const Text('Stop the Server'),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                ),
                onPressed: !connectionState.isConnected
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          await lgRepositoryState.launchBrowser();
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Browser launched!')),
                          );
                        } catch (e) {
                          messenger.showSnackBar(
                            SnackBar(
                                content: Text('Failed to launch browser: $e')),
                          );
                        }
                      },
                child: const Text('Launch Browser'),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: Colors.red.shade100, // Visual cue for close
                  foregroundColor: Colors.red.shade900,
                ),
                onPressed: !connectionState.isConnected
                    ? null
                    : () async {
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          await lgRepositoryState.closeBrowser();
                          messenger.showSnackBar(
                            const SnackBar(content: Text('Browser closed!')),
                          );
                        } catch (e) {
                          messenger.showSnackBar(
                            SnackBar(
                                content: Text('Failed to close browser: $e')),
                          );
                        }
                      },
                child: const Text('Close Browser'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
