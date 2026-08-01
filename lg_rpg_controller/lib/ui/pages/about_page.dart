import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/ui/widgets/app_drawer.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

/// One third-party asset pack, as listed in the repo's CREDITS.md.
class _Asset {
  final String title;
  final String author;
  final String source;

  const _Asset(this.title, this.author, this.source);
}

/// A licence and everything used under it. Mirrors CREDITS.md — keep the two in sync.
class _LicenseGroup {
  final String name;
  final String url;
  final List<_Asset> assets;

  const _LicenseGroup(this.name, this.url, this.assets);
}

const _credits = <_LicenseGroup>[
  _LicenseGroup(
    'CC BY 4.0 International',
    'https://creativecommons.org/licenses/by/4.0/',
    [
      _Asset(
        'Elementals: Water Priestess',
        'chierit',
        'https://chierit.itch.io/elementals-water-priestess',
      ),
    ],
  ),
  _LicenseGroup(
    'CC0 1.0',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    [
      _Asset(
        'Ninja Adventure Asset Pack',
        'Pixel-Boy and AAA',
        'https://pixel-boy.itch.io/ninja-adventure-asset-pack',
      ),
      _Asset(
        'Monsters Creatures Fantasy 1 and 2',
        'LuizMelo',
        'https://luizmelo.itch.io/',
      ),
      _Asset(
        'Debts in the Depths Asset Pack',
        'Reaktori',
        'https://reaktori.itch.io/debts-in-the-depths-asset-pack',
      ),
      _Asset(
        'Dungeon Tileset II Extended',
        "Niji, based on 0x72's Dungeon Tileset II",
        'https://nijikokun.itch.io/dungeontileset-ii-extended',
      ),
      _Asset(
        'Lucifer Pickups',
        'FoozleCC',
        'https://foozlecc.itch.io/lucifer-pickups',
      ),
      _Asset(
        'Ninja Jail Castle whatever Platformer Tiles',
        'R3tr0BoiDX',
        'https://opengameart.org/content/ninja-jail-castle-whatever-platformer-tiles',
      ),
    ],
  ),
];

/// Credits screen: the developer, the mentors, and every third-party asset pack
/// with its author and licence.
class AboutPage extends ConsumerWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = context.palette;

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: const Text('About'),
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ref
              .read(navigationProvider.notifier)
              .setIndex(NavigationIndex.home),
        ),
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SectionLabel('The developer'),
              const SizedBox(height: 12),
              const GlassCard(
                child: Text(
                  'Hi, my name is Shailesh Kumar Shukla and I am a software developer.',
                  style: TextStyle(fontSize: 15, height: 1.55),
                ),
              ),
              const SizedBox(height: 24),
              const SectionLabel('Thanks to the mentors'),
              const SizedBox(height: 12),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'For the guidance, the reviews, and the patience.',
                      style: TextStyle(
                        color: p.onSurfaceMuted,
                        fontSize: 14,
                        height: 1.5,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const _MentorRow('Victor Sanchez'),
                    const SizedBox(height: 10),
                    const _MentorRow('Prayag X'),
                    const SizedBox(height: 16),
                    const Divider(height: 1),
                    const SizedBox(height: 16),
                    Text(
                      'Thanks also to David, Jasmine, Joseph and the other Liquid Galaxy '
                      'team members for helping in testing the application.',
                      style: TextStyle(
                        color: p.onSurfaceMuted,
                        fontSize: 14,
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              const SectionLabel('Third-party assets'),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Text(
                  'The art, music and sound in LG RPG come from these creators. '
                  'Tap any entry to copy its link.',
                  style: TextStyle(
                    color: p.onSurfaceMuted,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),
              for (final group in _credits) ...[
                _LicenseHeader(group),
                const SizedBox(height: 10),
                GlassCard(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      for (var i = 0; i < group.assets.length; i++) ...[
                        if (i > 0)
                          const Divider(height: 1, indent: 18, endIndent: 18),
                        _AssetRow(group.assets[i]),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
              ],
              Center(
                child: Text(
                  'Made for Liquid Galaxy',
                  style: TextStyle(
                    color: p.onSurfaceMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MentorRow extends StatelessWidget {
  final String name;
  const _MentorRow(this.name);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: p.primary.withValues(alpha: 0.14),
            shape: BoxShape.circle,
            border: Border.all(color: p.primary.withValues(alpha: 0.4)),
          ),
          child: Icon(Icons.school_rounded, size: 18, color: p.primaryBright),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            name,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}

/// Licence name as a tappable chip; copies the licence deed URL.
class _LicenseHeader extends StatelessWidget {
  final _LicenseGroup group;
  const _LicenseHeader(this.group);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Align(
      alignment: Alignment.centerLeft,
      child: Material(
        color: p.gold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => _copy(context, group.url, 'License link copied'),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: p.gold.withValues(alpha: 0.35)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.workspace_premium_outlined, size: 15, color: p.gold),
                const SizedBox(width: 7),
                Text(
                  group.name,
                  style: TextStyle(
                    color: p.gold,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AssetRow extends StatelessWidget {
  final _Asset asset;
  const _AssetRow(this.asset);

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _copy(context, asset.source, 'Link copied'),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      asset.title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'by ${asset.author}',
                      style: TextStyle(color: p.onSurfaceMuted, fontSize: 13),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      asset.source,
                      style: TextStyle(
                        color: p.primaryBright,
                        fontSize: 12,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Icon(Icons.copy_rounded, size: 17, color: p.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Nothing here can open a browser (no url_launcher), so links go to the clipboard instead.
void _copy(BuildContext context, String url, String message) {
  Clipboard.setData(ClipboardData(text: url));
  showAppSnack(context, message);
}
