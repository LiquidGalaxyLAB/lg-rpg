import 'package:flutter/material.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/widgets/sprite_sheet.dart';

/// Presentational widgets for the Loadout page — deliberately flat (structure from whitespace and hairline dividers); the page owns the state, these are pure.

/// "4000" → "4s", "3500" → "3.5s".
String _seconds(int ms) {
  final s = ms / 1000;
  return s == s.roundToDouble() ? '${s.round()}s' : '${s.toStringAsFixed(1)}s';
}

/// Character select + base stats: centered portrait with prev/next chevrons, name and role, then the health / normal-attack readout.
class CharacterCard extends StatelessWidget {
  final CharacterDef character;
  final VoidCallback onPrev;
  final VoidCallback onNext;

  const CharacterCard({
    super.key,
    required this.character,
    required this.onPrev,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Column(
      children: [
        Row(
          children: [
            _Chevron(icon: Icons.chevron_left_rounded, onTap: onPrev),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Column(
                  key: ValueKey(character.id),
                  children: [
                    SizedBox(
                      height: 132,
                      child: Center(
                        child: character.idleSprite != null
                            ? AnimatedSprite(
                                character.idleSprite!.asset,
                                size: 132,
                                frameCount: character.idleSprite!.frames,
                                fps: 8,
                                zoom: 1.55,
                                dy: -0.04,
                              )
                            : Text(character.basicIcon,
                                style: const TextStyle(fontSize: 96)),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(character.displayName,
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    Text(
                      character.role.toUpperCase(),
                      style: TextStyle(
                        color: p.onSurfaceMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.6,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            _Chevron(icon: Icons.chevron_right_rounded, onTap: onNext),
          ],
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
                child: _Stat(Icons.favorite_rounded, '${character.maxHealth}',
                    'HEALTH', p.success)),
            Expanded(
                child: _Stat(Icons.flash_on_rounded, '${character.basicDamage}',
                    'DAMAGE', p.gold)),
            Expanded(
                child: _Stat(
                    Icons.timer_outlined,
                    _seconds(character.basicCooldownMs),
                    'ATK RATE',
                    p.primary)),
          ],
        ),
      ],
    );
  }
}

/// One base-stat: tinted icon + value, small caption below.
class _Stat extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color tint;

  const _Stat(this.icon, this.value, this.label, this.tint);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Column(
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: tint),
            const SizedBox(width: 6),
            Text(value,
                style: TextStyle(
                    color: p.onSurface,
                    fontSize: 18,
                    fontWeight: FontWeight.w800)),
          ],
        ),
        const SizedBox(height: 4),
        Text(label,
            style: TextStyle(
                color: p.onSurfaceMuted,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8)),
      ],
    );
  }
}

/// Plain circular chevron for the character carousel.
class _Chevron extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _Chevron({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return IconButton(
      onPressed: onTap,
      iconSize: 30,
      color: p.onSurfaceMuted,
      icon: Icon(icon),
    );
  }
}

/// The selected character's special attacks: flat rows split by hairlines.
class SpecialAttacksCard extends StatelessWidget {
  final CharacterDef character;

  const SpecialAttacksCard({super.key, required this.character});

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Column(
      children: [
        for (int i = 0; i < character.specials.length; i++) ...[
          if (i > 0) Divider(height: 1, color: p.border),
          _AttackRow(character.specials[i]),
        ],
      ],
    );
  }
}

class _AttackRow extends StatelessWidget {
  final SpecialDef special;

  const _AttackRow(this.special);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final sprite = special.sprite;
    // Stubbed specials still swing a basic melee, so they're marked rather than hidden — hiding them would make the kit look smaller than it is.
    final soon = special.stub;

    return Opacity(
      opacity: soon ? 0.55 : 1,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 34,
              child: Center(
                child: sprite != null
                    ? SpriteFrame(sprite.asset, size: 30, zoom: 1.1)
                    : Text(special.icon, style: const TextStyle(fontSize: 22)),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          special.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: p.onSurface,
                              fontSize: 15,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      if (soon) ...[
                        const SizedBox(width: 6),
                        Text('SOON',
                            style: TextStyle(
                                color: p.onSurfaceMuted,
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.6)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(special.desc,
                      style:
                          TextStyle(color: p.onSurfaceMuted, fontSize: 12.5)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            if (special.damage > 0)
              Text('${special.damage}',
                  style: TextStyle(
                      color: p.gold,
                      fontSize: 15,
                      fontWeight: FontWeight.w800)),
            const SizedBox(width: 10),
            SizedBox(
              width: 34,
              child: Text(
                _seconds(special.cooldownMs),
                textAlign: TextAlign.right,
                style: TextStyle(
                    color: p.onSurfaceMuted,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One titled band of equippable items (power-ups, or health), so the two kinds read as different things rather than one undifferentiated grid.
class ItemGroup extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color tint;
  final List<LoadoutItemDef> items;
  final List<String> loadout;
  final bool full;
  final void Function(String id) onToggle;

  const ItemGroup({
    super.key,
    required this.title,
    required this.icon,
    required this.tint,
    required this.items,
    required this.loadout,
    required this.full,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final equipped = items.where((i) => loadout.contains(i.id)).length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(icon, size: 15, color: tint),
            const SizedBox(width: 7),
            Text(title.toUpperCase(),
                style: TextStyle(
                    color: p.onSurface,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.4)),
            const SizedBox(width: 8),
            Expanded(child: Divider(height: 1, color: p.border)),
            const SizedBox(width: 8),
            Text('$equipped equipped',
                style: TextStyle(color: p.onSurfaceMuted, fontSize: 11)),
          ],
        ),
        const SizedBox(height: 12),
        // A centered Wrap with width-locked tiles: power-ups fill the row of 4, the 3-item Health row centers instead of leaving a ragged blank slot, and tiles hug their content height.
        LayoutBuilder(
          builder: (context, c) {
            const spacing = 10.0;
            final tileWidth = (c.maxWidth - spacing * 3) / 4;
            return Wrap(
              spacing: spacing,
              runSpacing: spacing,
              alignment: WrapAlignment.center,
              children: [
                for (final it in items)
                  SizedBox(
                    width: tileWidth,
                    child: _ItemTile(
                      def: it,
                      tint: tint,
                      selected: loadout.contains(it.id),
                      disabled: full && !loadout.contains(it.id),
                      onTap: () => onToggle(it.id),
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

/// Square item tile; tinted ring and check when equipped, long-press for the description.
class _ItemTile extends StatelessWidget {
  final LoadoutItemDef def;
  final Color tint;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  const _ItemTile({
    required this.def,
    required this.tint,
    required this.selected,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Tooltip(
      message: '${def.label} — ${def.desc}',
      triggerMode: TooltipTriggerMode.longPress,
      child: Opacity(
        opacity: disabled ? 0.4 : 1,
        child: Material(
          color: selected ? tint.withValues(alpha: 0.12) : p.surface,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: onTap,
            child: Stack(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: selected ? tint : p.border,
                      width: selected ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(def.icon, style: const TextStyle(fontSize: 26)),
                      const SizedBox(height: 6),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text(
                          def.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: selected ? p.onSurface : p.onSurfaceMuted,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (selected)
                  Positioned(
                    top: 5,
                    right: 5,
                    child:
                        Icon(Icons.check_circle_rounded, color: tint, size: 16),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
