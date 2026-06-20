import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_joystick/flutter_joystick.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';

class ControllerPage extends ConsumerStatefulWidget {
  const ControllerPage({super.key});

  @override
  ConsumerState<ControllerPage> createState() => _ControllerPageState();
}

class _ControllerPageState extends ConsumerState<ControllerPage> {
  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
    ]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Row(
          children: [
            // Left: movement joystick.
            Expanded(
              child: Center(
                child: Joystick(
                  listener: (details) {
                    ref
                        .read(movePlayerUseCaseProvider)
                        .call(details.x, details.y);
                  },
                ),
              ),
            ),
            // Right: attack button (server cooldown-gates rapid taps).
            Expanded(
              child: Center(
                child: GestureDetector(
                  onTap: () => ref.read(attackPlayerUseCaseProvider).call(),
                  child: Container(
                    width: 120,
                    height: 120,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: Color(0xFFD32F2F),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black45,
                            blurRadius: 8,
                            offset: Offset(0, 4)),
                      ],
                    ),
                    child: const Icon(Icons.gps_fixed,
                        color: Colors.white, size: 48),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
