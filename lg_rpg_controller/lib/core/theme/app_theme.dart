import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Colour tokens for one theme (light or dark). Read them via `context.palette`.
@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  /// Page background.
  final Color bg;

  /// Cards and sheets sitting on [bg].
  final Color surface;

  /// Tonal fill: inputs, selected rows, secondary chips.
  final Color surfaceHigh;

  /// Hairline separators and card outlines.
  final Color border;

  /// The one accent. Reserved for the primary action and "this is selected".
  final Color primary;

  /// Lighter [primary], for text/icons on tinted backgrounds.
  final Color primaryBright;

  /// Foreground on top of [primary].
  final Color onPrimary;

  /// Secondary accent. Offence: attacks and specials.
  final Color gold;

  /// Status, and restorative things (health): connected, complete, healed.
  final Color success;

  /// Status only: degraded, needs attention.
  final Color warning;

  /// Destructive actions only (stop, reboot, disconnect, clear); never filled or used for branding — red in this app always means "careful".
  final Color danger;

  /// Primary text and icons.
  final Color onSurface;

  /// Secondary text, captions, inactive icons.
  final Color onSurfaceMuted;

  /// Fill for the primary CTA.
  final Gradient primaryGradient;

  /// Barely-there wash at the top of immersive pages.
  final Gradient heroGlow;

  const AppPalette({
    required this.bg,
    required this.surface,
    required this.surfaceHigh,
    required this.border,
    required this.primary,
    required this.primaryBright,
    required this.onPrimary,
    required this.gold,
    required this.success,
    required this.warning,
    required this.danger,
    required this.onSurface,
    required this.onSurfaceMuted,
    required this.primaryGradient,
    required this.heroGlow,
  });

  /// Cool paper, near-black ink, the violet accent darkened so it still holds contrast against white.
  static const light = AppPalette(
    bg: Color(0xFFF6F5F2),
    surface: Color(0xFFFFFFFF),
    surfaceHigh: Color(0xFFF1F0EC),
    border: Color(0xFFE3E1DA),
    primary: Color(0xFF6455E0),
    primaryBright: Color(0xFF5A4BD6),
    onPrimary: Color(0xFFFFFFFF),
    gold: Color(0xFFB4791A),
    success: Color(0xFF1F9D55),
    warning: Color(0xFFB45309),
    danger: Color(0xFFC94060),
    onSurface: Color(0xFF16181D),
    onSurfaceMuted: Color(0xFF6B7280),
    primaryGradient: LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF7264F0), Color(0xFF5A4BD6)],
    ),
    // Much fainter than the dark glow: on a light page the same alpha tints the whole surface lavender instead of reading as a highlight.
    heroGlow: LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0x0A7C6CF6), Color(0x007C6CF6)],
    ),
  );

  /// Dark theme: near-black backgrounds with a violet accent.
  static const dark = AppPalette(
    bg: Color(0xFF0B0D12),
    surface: Color(0xFF141821),
    surfaceHigh: Color(0xFF1B202B),
    border: Color(0xFF272D3A),
    primary: Color(0xFF7C6CF6),
    primaryBright: Color(0xFF9B8DFF),
    onPrimary: Color(0xFFFFFFFF),
    gold: Color(0xFFF5B14C),
    success: Color(0xFF35C880),
    warning: Color(0xFFF0A94A),
    danger: Color(0xFFF4738A),
    onSurface: Color(0xFFECEEF3),
    onSurfaceMuted: Color(0xFF8B94A6),
    primaryGradient: LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF8B7CFF), Color(0xFF6353E8)],
    ),
    heroGlow: LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Color(0x1A7C6CF6), Color(0x007C6CF6)],
    ),
  );

  @override
  AppPalette copyWith({
    Color? bg,
    Color? surface,
    Color? surfaceHigh,
    Color? border,
    Color? primary,
    Color? primaryBright,
    Color? onPrimary,
    Color? gold,
    Color? success,
    Color? warning,
    Color? danger,
    Color? onSurface,
    Color? onSurfaceMuted,
    Gradient? primaryGradient,
    Gradient? heroGlow,
  }) {
    return AppPalette(
      bg: bg ?? this.bg,
      surface: surface ?? this.surface,
      surfaceHigh: surfaceHigh ?? this.surfaceHigh,
      border: border ?? this.border,
      primary: primary ?? this.primary,
      primaryBright: primaryBright ?? this.primaryBright,
      onPrimary: onPrimary ?? this.onPrimary,
      gold: gold ?? this.gold,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
      onSurface: onSurface ?? this.onSurface,
      onSurfaceMuted: onSurfaceMuted ?? this.onSurfaceMuted,
      primaryGradient: primaryGradient ?? this.primaryGradient,
      heroGlow: heroGlow ?? this.heroGlow,
    );
  }

  @override
  AppPalette lerp(covariant AppPalette? other, double t) {
    if (other == null) return this;
    return AppPalette(
      bg: Color.lerp(bg, other.bg, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceHigh: Color.lerp(surfaceHigh, other.surfaceHigh, t)!,
      border: Color.lerp(border, other.border, t)!,
      primary: Color.lerp(primary, other.primary, t)!,
      primaryBright: Color.lerp(primaryBright, other.primaryBright, t)!,
      onPrimary: Color.lerp(onPrimary, other.onPrimary, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
      onSurface: Color.lerp(onSurface, other.onSurface, t)!,
      onSurfaceMuted: Color.lerp(onSurfaceMuted, other.onSurfaceMuted, t)!,
      primaryGradient:
          Gradient.lerp(primaryGradient, other.primaryGradient, t) ??
              primaryGradient,
      heroGlow: Gradient.lerp(heroGlow, other.heroGlow, t) ?? heroGlow,
    );
  }
}

extension AppPaletteContext on BuildContext {
  /// Colour tokens for the active theme.
  AppPalette get palette =>
      Theme.of(this).extension<AppPalette>() ?? AppPalette.dark;
}

class AppTheme {
  AppTheme._();

  static const _radius = 14.0;

  static ThemeData light() => _build(AppPalette.light, Brightness.light);

  static ThemeData dark() => _build(AppPalette.dark, Brightness.dark);

  static ThemeData _build(AppPalette p, Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final scheme = ColorScheme(
      brightness: brightness,
      primary: p.primary,
      onPrimary: p.onPrimary,
      secondary: p.onSurface,
      onSecondary: p.bg,
      surface: p.surface,
      onSurface: p.onSurface,
      error: p.danger,
      onError: Colors.white,
      outline: p.border,
    );

    final baseText =
        GoogleFonts.interTextTheme(ThemeData(brightness: brightness).textTheme);

    TextStyle display(double size) => GoogleFonts.spaceGrotesk(
          fontSize: size,
          fontWeight: FontWeight.w700,
          color: p.onSurface,
          letterSpacing: -0.5,
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: p.bg,
      extensions: [p],
      textTheme: baseText
          .apply(bodyColor: p.onSurface, displayColor: p.onSurface)
          .copyWith(
            headlineSmall: display(24),
            titleLarge: display(20),
            bodyMedium:
                baseText.bodyMedium?.copyWith(color: p.onSurface, fontSize: 16),
          ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        systemOverlayStyle:
            isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        iconTheme: IconThemeData(color: p.onSurface),
        titleTextStyle: GoogleFonts.spaceGrotesk(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: 0,
          color: p.onSurface,
        ),
      ),
      iconTheme: IconThemeData(color: p.onSurface),
      drawerTheme: DrawerThemeData(backgroundColor: p.bg),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.surfaceHigh,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: TextStyle(color: p.onSurfaceMuted),
        floatingLabelStyle: TextStyle(color: p.onSurfaceMuted),
        hintStyle: TextStyle(color: p.onSurfaceMuted),
        prefixIconColor: p.onSurfaceMuted,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: BorderSide(color: p.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: BorderSide(color: p.primary, width: 1.6),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: BorderSide(color: p.border),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          textStyle: WidgetStatePropertyAll(
            GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 15),
          ),
          // Selected reads as the accent, so "what's chosen" and "what to tap" speak the same colour language.
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) return p.primary;
            return p.surface;
          }),
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) return p.onPrimary;
            return p.onSurfaceMuted;
          }),
          side: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.selected)) {
              return BorderSide(color: p.primary);
            }
            return BorderSide(color: p.border);
          }),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(_radius)),
          ),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? p.surfaceHigh : p.onSurface,
        contentTextStyle: TextStyle(color: isDark ? p.onSurface : p.bg),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_radius)),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: isDark ? p.surfaceHigh : p.onSurface,
          borderRadius: BorderRadius.circular(8),
          border: isDark ? Border.all(color: p.border) : null,
        ),
        textStyle: TextStyle(color: isDark ? p.onSurface : p.bg, fontSize: 12),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: p.primary),
      dividerTheme: DividerThemeData(color: p.border, space: 1),
    );
  }
}
