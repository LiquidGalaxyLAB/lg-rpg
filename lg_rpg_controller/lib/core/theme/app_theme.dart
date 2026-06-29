import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Single source of truth for the controller's look: warm paper, near-black ink, one crimson accent; flat and restrained (no neon, no glow).
class AppColors {
  AppColors._();

  static const bg = Color(0xFFF4F1EA); // warm paper
  static const bgElevated = Color(0xFFFFFFFF);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceHigh = Color(0xFFF7F4ED); // input / tonal fill
  static const border = Color(0xFFE4DFD4); // warm hairline

  static const primary = Color(0xFFD7263D); // crimson
  static const primaryBright = Color(0xFFE14B5A);
  static const accent = Color(0xFFD7263D);

  static const success = Color(0xFF1F9D55);
  static const warning = Color(0xFFB45309);
  static const danger = Color(0xFFB91C1C); // deeper red for destructive

  static const onSurface = Color(0xFF16181D); // ink
  static const onSurfaceMuted = Color(0xFF6B7280); // slate
}

class AppGradients {
  AppGradients._();

  static const primary = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFE02E45), Color(0xFFC01F33)],
  );

  static const accent = primary;

  /// Barely-there warm highlight at the top of immersive pages.
  static const heroGlow = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0x40FFFFFF), Color(0x00FFFFFF)],
  );
}

class AppTheme {
  AppTheme._();

  static const _radius = 14.0;

  static ThemeData light() {
    const scheme = ColorScheme.light(
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.onSurface,
      onSecondary: Colors.white,
      surface: AppColors.surface,
      onSurface: AppColors.onSurface,
      error: AppColors.danger,
      onError: Colors.white,
      outline: AppColors.border,
    );

    final baseText = GoogleFonts.interTextTheme(
      ThemeData(brightness: Brightness.light).textTheme,
    );

    TextStyle display(double size) => GoogleFonts.spaceGrotesk(
          fontSize: size,
          fontWeight: FontWeight.w700,
          color: AppColors.onSurface,
          letterSpacing: -0.5,
        );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.bg,
      textTheme: baseText.copyWith(
        headlineSmall: display(24),
        titleLarge: display(20),
        bodyMedium: baseText.bodyMedium
            ?.copyWith(color: AppColors.onSurface, fontSize: 16),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        iconTheme: const IconThemeData(color: AppColors.onSurface),
        titleTextStyle: GoogleFonts.spaceGrotesk(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
          color: AppColors.onSurface,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceHigh,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: const TextStyle(color: AppColors.onSurfaceMuted),
        floatingLabelStyle: const TextStyle(color: AppColors.onSurfaceMuted),
        hintStyle: const TextStyle(color: AppColors.onSurfaceMuted),
        prefixIconColor: AppColors.onSurfaceMuted,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: const BorderSide(color: AppColors.border),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          textStyle: WidgetStatePropertyAll(
            GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15),
          ),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return AppColors.onSurface;
            }
            return Colors.white;
          }),
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) return Colors.white;
            return AppColors.onSurfaceMuted;
          }),
          side: const WidgetStatePropertyAll(
            BorderSide(color: AppColors.border),
          ),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radius)),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.onSurface,
        contentTextStyle: const TextStyle(color: AppColors.bg),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(_radius)),
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: AppColors.primary),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
    );
  }
}
