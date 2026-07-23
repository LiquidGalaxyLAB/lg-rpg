import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/ui/pages/loadout_widgets.dart';
import 'package:lg_rpg_controller/ui/providers/game_providers.dart';
import 'package:lg_rpg_controller/ui/widgets/app_drawer.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

/// Pre-match character-select and loadout screen. No confirm step — whatever is on screen is what you play.
class InventoryPage extends ConsumerStatefulWidget {
  const InventoryPage({super.key});

  @override
  ConsumerState<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends ConsumerState<InventoryPage> {
  String _character = CharacterCatalog.defaultCharacter;
  List<String> _loadout = <String>[];

  @override
  void initState() {
    super.initState();
    _seedFromStorage();
  }

  Future<void> _seedFromStorage() async {
    final ls = ref.read(localStorageProvider);
    final char = await ls.getPlayerCharacter();
    final load = await ls.getPlayerLoadout();
    if (!mounted) return;
    setState(() {
      if (char != null && char.isNotEmpty) _character = char;
      _loadout = load;
    });
    ref.read(selectedCharacterProvider.notifier).state = _character;
  }

  void _cycleCharacter(int step) {
    final all = CharacterCatalog.characters;
    final i = all.indexWhere((c) => c.id == _character);
    final next = all[(i + step + all.length) % all.length].id;
    setState(() => _character = next);
    ref.read(selectedCharacterProvider.notifier).state = next;
    ref.read(selectCharacterUseCaseProvider).call(next);
  }

  void _toggleItem(String id) {
    final selected = _loadout.contains(id);
    if (!selected && _loadout.length >= LoadoutConfig.slots) {
      showAppSnack(
          context, 'Only ${LoadoutConfig.slots} slots — remove one first.');
      return;
    }
    setState(() {
      selected ? _loadout.remove(id) : _loadout.add(id);
    });
    ref.read(setLoadoutUseCaseProvider).call(List<String>.from(_loadout));
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final character = CharacterCatalog.byId(_character);
    final full = _loadout.length >= LoadoutConfig.slots;
    final caption = TextStyle(color: p.onSurfaceMuted, fontSize: 12.5);

    return Scaffold(
      extendBodyBehindAppBar: true,
      // Same navigation model as Home: the hamburger opens the shared drawer.
      drawer: const AppDrawer(),
      appBar: AppBar(),
      body: Container(
        decoration: BoxDecoration(gradient: p.heroGlow),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
              20,
              MediaQuery.of(context).padding.top + kToolbarHeight + 12,
              20,
              24,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CharacterCard(
                  character: character,
                  onPrev: () => _cycleCharacter(-1),
                  onNext: () => _cycleCharacter(1),
                ),
                const SizedBox(height: 24),
                const SectionLabel('Special Attacks'),
                const SizedBox(height: 6),
                Text('Always equipped — tap in-match to arm.', style: caption),
                const SizedBox(height: 12),
                SpecialAttacksCard(character: character),
                const SizedBox(height: 24),
                SectionLabel(
                    'Items · ${_loadout.length}/${LoadoutConfig.slots}'),
                const SizedBox(height: 6),
                Text(
                  'Power-ups and potions share these ${LoadoutConfig.slots} slots.',
                  style: caption,
                ),
                const SizedBox(height: 14),
                ItemGroup(
                  title: 'Power-ups',
                  icon: Icons.bolt_rounded,
                  tint: p.primary,
                  items: PowerupCatalog.items,
                  loadout: _loadout,
                  full: full,
                  onToggle: _toggleItem,
                ),
                const SizedBox(height: 18),
                ItemGroup(
                  title: 'Health',
                  icon: Icons.favorite_rounded,
                  tint: p.success,
                  items: HealthCatalog.items,
                  loadout: _loadout,
                  full: full,
                  onToggle: _toggleItem,
                ),
                const SizedBox(height: 12),
                Text(
                  'Hold an item for details',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.onSurfaceMuted, fontSize: 11.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
