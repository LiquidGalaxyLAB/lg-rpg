import 'package:flutter/material.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';

enum AppButtonVariant { primary, tonal, danger }

/// Shows a floating snackbar, replacing any one currently visible.
void showAppSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// The app's standard button, with primary, tonal and danger variants.
class AppButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool loading;
  final AppButtonVariant variant;

  const AppButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.loading = false,
    this.variant = AppButtonVariant.primary,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final enabled = onPressed != null && !loading;
    final isPrimary = variant == AppButtonVariant.primary;
    // A disabled primary button goes quiet and neutral.
    final mutedCta = isPrimary && !enabled && !loading;

    Color fg;
    Color bg;
    Gradient? gradient;
    Border? border;
    switch (variant) {
      case AppButtonVariant.primary:
        if (mutedCta) {
          bg = p.surfaceHigh;
          fg = p.onSurfaceMuted;
          border = Border.all(color: p.border);
        } else {
          bg = p.primary;
          gradient = p.primaryGradient;
          fg = p.onPrimary;
        }
        break;
      case AppButtonVariant.tonal:
        bg = p.surface;
        fg = p.onSurface;
        border = Border.all(color: p.border);
        break;
      case AppButtonVariant.danger:
        bg = p.surface;
        fg = p.danger;
        border = Border.all(color: p.danger.withValues(alpha: 0.55));
        break;
    }

    return Opacity(
      // The muted CTA is already quiet by colour; dimming it too would make the label unreadable.
      opacity: (enabled || mutedCta) ? 1 : 0.4,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: gradient == null ? bg : null,
          gradient: gradient,
          borderRadius: BorderRadius.circular(14),
          border: border,
          boxShadow: enabled && isPrimary
              ? [
                  BoxShadow(
                    color: p.primary.withValues(alpha: 0.28),
                    blurRadius: 20,
                    offset: const Offset(0, 6),
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: enabled ? onPressed : null,
            child: SizedBox(
              height: 56,
              child: Center(
                child: loading
                    ? SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.4,
                          color: fg,
                        ),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (icon != null) ...[
                            Icon(icon, color: fg, size: 20),
                            const SizedBox(width: 10),
                          ],
                          Text(
                            label,
                            style: TextStyle(
                              color: fg,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Rounded container used to group related content.
class GlassCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;

  const GlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: p.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
  }
}

/// Small uppercase section heading with a leading tick.
class SectionLabel extends StatelessWidget {
  final String text;
  const SectionLabel(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Row(
      children: [
        Container(
          width: 3,
          height: 14,
          decoration: BoxDecoration(
            color: p.onSurfaceMuted.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 9),
        Text(
          text.toUpperCase(),
          style: TextStyle(
            color: p.onSurfaceMuted,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            letterSpacing: 1.5,
          ),
        ),
      ],
    );
  }
}

/// Connection status pill. Tappable when [onTap] is set.
class StatusPill extends StatelessWidget {
  final bool active;
  final String label;
  final IconData activeIcon;
  final IconData inactiveIcon;
  final VoidCallback? onTap;

  const StatusPill({
    super.key,
    required this.active,
    required this.label,
    this.activeIcon = Icons.cloud_done_rounded,
    this.inactiveIcon = Icons.cloud_off_rounded,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final color = active ? p.success : p.onSurfaceMuted;
    return Material(
      color: active ? p.success.withValues(alpha: 0.12) : p.surfaceHigh,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: active ? p.success.withValues(alpha: 0.35) : p.border,
            ),
          ),
          child: Row(
            children: [
              // A filled icon for live, hollow for idle: the state survives even if you can't tell the two colours apart.
              Icon(active ? activeIcon : inactiveIcon, color: color, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: active ? p.success : p.onSurface,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
              if (onTap != null && !active)
                Icon(Icons.chevron_right_rounded,
                    color: p.onSurfaceMuted, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
