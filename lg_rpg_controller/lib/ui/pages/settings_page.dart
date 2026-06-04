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
    final orientation = MediaQuery.of(context).orientation;

    InputDecoration fieldDecoration(String label, String hint) {
      return InputDecoration(
        labelText: label,
        hintText: hint,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(vertical: 8),
      );
    }

    Widget fieldRow(Widget left, Widget right) {
      return Row(
        children: [
          Expanded(child: left),
          const SizedBox(width: 20),
          Expanded(child: right),
        ],
      );
    }

    return Scaffold(body: SafeArea(child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
      if (orientation == Orientation.landscape) {
        return SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            48,
            64,
            104,
            MediaQuery.of(context).viewInsets.bottom + 16,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  children: [
                    fieldRow(
                      TextField(
                        controller: _portController,
                        keyboardType: TextInputType.number,
                        decoration: fieldDecoration('Port', '22'),
                      ),
                      TextField(
                        controller: _usernameController,
                        decoration: fieldDecoration('Username', 'lg'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    fieldRow(
                      TextField(
                        controller: _passwordController,
                        decoration: fieldDecoration('Password', 'lg'),
                      ),
                      TextField(
                        controller: _ipController,
                        keyboardType: TextInputType.number,
                        decoration: fieldDecoration('IP Address', '192.34.4.0'),
                      ),
                    ),
                    const SizedBox(height: 12),
                    fieldRow(
                      TextField(
                        controller: _screenNumberController,
                        keyboardType: TextInputType.number,
                        decoration: fieldDecoration('Screen Number', '3'),
                      ),
                      const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 32),
              SizedBox(
                width: 170,
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      ElevatedButton(
                        onPressed: connectionState.isConnected
                            ? null
                            : () async {
                                final notifier =
                                    ref.read(connectionProvider.notifier);
                                notifier.setIp(_ipController.text);
                                notifier.setPort(
                                  int.parse(_portController.text),
                                );
                                notifier.setUsername(_usernameController.text);
                                notifier.setPassword(_passwordController.text);
                                await notifier.setScreenNumber(
                                  int.parse(_screenNumberController.text),
                                );
                                if (!context.mounted) return;
                                try {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text(
                                            'Connecting to Liquid Galaxy')),
                                  );

                                  await notifier.connect();
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content:
                                            Text('Connected successfully!')),
                                  );
                                } catch (e) {
                                  if (!mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                        content: Text('Failed to connect: $e')),
                                  );
                                }
                              },
                        child: const Text('Connect'),
                      ),
                      const SizedBox(height: 10),
                      ElevatedButton(
                          onPressed: !connectionState.isConnected
                              ? null
                              : () async {
                                  await ref
                                      .read(connectionProvider.notifier)
                                      .disconnect();
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Disconnected!')),
                                  );
                                },
                          child: const Text('Disconnect')),
                      const SizedBox(height: 10),
                      ElevatedButton(
                          onPressed: !connectionState.isConnected
                              ? null
                              : () async {
                                  await lgRepositoryState.startServer();
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Server Started!')),
                                  );
                                },
                          child: const Text('Start the Server')),
                      const SizedBox(height: 10),
                      ElevatedButton(
                          onPressed: !connectionState.isConnected
                              ? null
                              : () async {
                                  await lgRepositoryState.stopServer();
                                  if (!context.mounted) return;
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                        content: Text('Server Stopped!')),
                                  );
                                },
                          child: const Text('Stop the Server')),
                    ]),
              ),
            ],
          ),
        );
      }
      return const Center(
        child: Text('Please rotate your device to landscape mode.'),
      );
    })));
  }
}
