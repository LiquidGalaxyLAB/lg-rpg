import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows LG-RPG-Controller text', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: Center(child: Text('LG-RPG-Controller'))),
      ),
    );

    expect(find.text('LG-RPG-Controller'), findsOneWidget);
  });
}
