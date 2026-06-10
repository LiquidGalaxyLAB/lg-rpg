import 'package:flutter_riverpod/flutter_riverpod.dart';

abstract final class NavigationIndex {
  static const home = 0;
  static const lgTask = 1;
  static const wheel = 2;
  static const quest = 3;
  static const settings = 4;
  static const controller = 5;
  static const inventory = 6;
}

class NavigationNotifier extends StateNotifier<int> {
  NavigationNotifier() : super(NavigationIndex.home);

  void setIndex(int index) {
    state = index;
  }
}

final navigationProvider =
    StateNotifierProvider<NavigationNotifier, int>((ref) {
  return NavigationNotifier();
});
