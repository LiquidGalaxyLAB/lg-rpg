import 'package:flutter_riverpod/flutter_riverpod.dart';

// Indices must line up with MainScreen's `_pages` list, in order.
abstract final class NavigationIndex {
  static const home = 0;
  static const settings = 1;
  static const controller = 2;
  static const matchWaiting = 3;
  static const matchResult = 4;
  static const lgTask = 5;
  static const inventory = 6;
  static const map = 7;
  static const about = 8;
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
