import 'dart:async';

import 'package:flutter/material.dart';

/// Shows one square frame of a horizontal sprite strip.
class SpriteFrame extends StatelessWidget {
  final String asset;
  final double size;
  final int frame;

  /// Magnifies the frame inside the box (crops the edges) — handy for character sheets where the figure only fills the middle of the frame.
  final double zoom;

  /// Vertical nudge as a fraction of [size]; negative moves the art up.
  final double dy;

  const SpriteFrame(
    this.asset, {
    super.key,
    required this.size,
    this.frame = 0,
    this.zoom = 1.0,
    this.dy = 0,
  });

  @override
  Widget build(BuildContext context) {
    final frameSize = size * zoom;
    return SizedBox(
      width: size,
      height: size,
      child: ClipRect(
        child: OverflowBox(
          maxWidth: double.infinity,
          maxHeight: double.infinity,
          alignment: Alignment.centerLeft,
          child: Transform.translate(
            offset: Offset(
              -frame * frameSize - (frameSize - size) / 2,
              dy * size,
            ),
            child: Image.asset(
              asset,
              height: frameSize,
              fit: BoxFit.fitHeight,
              filterQuality: FilterQuality.none,
            ),
          ),
        ),
      ),
    );
  }
}

/// Loops the first [frameCount] frames of a strip at [fps].
class AnimatedSprite extends StatefulWidget {
  final String asset;
  final double size;
  final int frameCount;
  final double fps;
  final double zoom;
  final double dy;

  const AnimatedSprite(
    this.asset, {
    super.key,
    required this.size,
    required this.frameCount,
    this.fps = 10,
    this.zoom = 1.0,
    this.dy = 0,
  });

  @override
  State<AnimatedSprite> createState() => _AnimatedSpriteState();
}

class _AnimatedSpriteState extends State<AnimatedSprite> {
  Timer? _timer;
  int _frame = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
      Duration(milliseconds: (1000 / widget.fps).round()),
      (_) {
        if (!mounted) return;
        setState(() => _frame = (_frame + 1) % widget.frameCount);
      },
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SpriteFrame(
      widget.asset,
      size: widget.size,
      frame: _frame,
      zoom: widget.zoom,
      dy: widget.dy,
    );
  }
}
