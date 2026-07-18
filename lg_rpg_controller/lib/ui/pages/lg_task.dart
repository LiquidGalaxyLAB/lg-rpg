import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/providers/connection_provider.dart';
import 'package:lg_rpg_controller/ui/providers/lg_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

class LgTask extends ConsumerStatefulWidget {
  const LgTask({super.key});

  @override
  ConsumerState<LgTask> createState() => _LgTaskState();
}

class _LgTaskState extends ConsumerState<LgTask> {
  /// Which task is in flight, so only the tapped button shows a spinner.
  String? _busyTask;

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _run(
    String task,
    Future<void> Function() action,
    String success,
    String failure,
  ) async {
    setState(() => _busyTask = task);
    try {
      await action();
      _snack(success);
    } catch (e) {
      _snack('$failure: $e');
    } finally {
      if (mounted) setState(() => _busyTask = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final connection = ref.watch(connectionProvider);
    final connected = connection.isConnected;
    final idle = _busyTask == null;

    return Scaffold(
      appBar: AppBar(
        title: const Text('LG Tasks'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ref
              .read(navigationProvider.notifier)
              .setIndex(NavigationIndex.settings),
        ),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              StatusPill(
                active: connected,
                label:
                    connected ? 'Connected to Liquid Galaxy' : 'Not connected',
              ),
              const SizedBox(height: 26),
              const SectionLabel('Logo & Overlay'),
              const SizedBox(height: 12),
              AppButton(
                label: 'Show Logo',
                icon: Icons.image_outlined,
                variant: AppButtonVariant.tonal,
                loading: _busyTask == 'logo',
                onPressed: (connected && idle)
                    ? () => _run(
                          'logo',
                          () => ref.read(sendLogoUseCaseProvider).call(),
                          'Logo displayed',
                          'Show logo failed',
                        )
                    : null,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Clear KML',
                icon: Icons.cleaning_services_outlined,
                variant: AppButtonVariant.danger,
                loading: _busyTask == 'kml',
                onPressed: (connected && idle)
                    ? () => _run(
                          'kml',
                          () => ref.read(cleanKmlUseCaseProvider).call(),
                          'KML cleared',
                          'Clear KML failed',
                        )
                    : null,
              ),
              const SizedBox(height: 26),
              const SectionLabel('System'),
              const SizedBox(height: 12),
              AppButton(
                label: 'Relaunch',
                icon: Icons.restart_alt_rounded,
                variant: AppButtonVariant.tonal,
                loading: _busyTask == 'relaunch',
                onPressed: (connected && idle)
                    ? () => _run(
                          'relaunch',
                          () => ref.read(relaunchLgUseCaseProvider).call(),
                          'Liquid Galaxy relaunched',
                          'Relaunch failed',
                        )
                    : null,
              ),
              const SizedBox(height: 12),
              AppButton(
                label: 'Reboot',
                icon: Icons.power_settings_new_rounded,
                variant: AppButtonVariant.danger,
                loading: _busyTask == 'reboot',
                onPressed: (connected && idle)
                    ? () => _run(
                          'reboot',
                          () async {
                            final ok =
                                await ref.read(rebootLgUseCaseProvider).call();
                            if (!ok) throw Exception('rig did not accept');
                          },
                          'Rebooting all machines',
                          'Reboot failed',
                        )
                    : null,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
