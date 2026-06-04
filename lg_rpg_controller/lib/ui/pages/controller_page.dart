import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ControllerPage extends ConsumerStatefulWidget {
  const ControllerPage({super.key});

  @override
  ConsumerState<ControllerPage> createState() => _ControllerPageState();
}

class _ControllerPageState extends ConsumerState<ControllerPage> {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text(
          'ControllerPage',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
