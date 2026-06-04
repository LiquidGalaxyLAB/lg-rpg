import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class LgTask extends ConsumerStatefulWidget {
  const LgTask({super.key});

  @override
  ConsumerState<LgTask> createState() => _LgTaskState();
}

class _LgTaskState extends ConsumerState<LgTask> {
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text(
          'Lg Task',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
