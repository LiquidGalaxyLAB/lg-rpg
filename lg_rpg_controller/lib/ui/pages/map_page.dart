import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:lg_rpg_controller/core/theme/app_theme.dart';
import 'package:lg_rpg_controller/domain/entities/place_area_entity.dart';
import 'package:lg_rpg_controller/ui/providers/connection_provider.dart';
import 'package:lg_rpg_controller/ui/providers/lg_providers.dart';
import 'package:lg_rpg_controller/ui/providers/navigation_provider.dart';
import 'package:lg_rpg_controller/ui/widgets/app_widgets.dart';

/// Google Map that drives the rig's Google Earth: pan/zoom flies the rig, searching a place flies there and rings it with a 3D shape.
class MapPage extends ConsumerStatefulWidget {
  const MapPage({super.key});

  @override
  ConsumerState<MapPage> createState() => _MapPageState();
}

class _MapPageState extends ConsumerState<MapPage> {
  GoogleMapController? _map;

  /// Wait for the gesture to settle before sending a flyTo, so the rig isn't flooded.
  static const _syncDebounce = Duration(milliseconds: 500);
  Timer? _debounce;
  bool _flyInFlight = false;

  /// True while the map animates to a search result, so the camera-sync doesn't echo every animation frame to the rig.
  bool _programmaticMove = false;

  CameraPosition _camera = _initialCamera;
  LatLng? _selected;

  /// Range last sent to the rig; Orbit reuses it so it centers correctly even if the map is still animating.
  double? _lastRange;

  /// Name of the last searched place shown on the rig.
  String? _placeName;

  bool _orbiting = false;
  bool _busy = false;

  /// Seconds per revolution; the orbit runs until stopped, so this only sets the speed.
  static const _secondsPerRevolution = 30;

  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();
  Timer? _searchDebounce;
  List<PlaceAreaEntity> _results = const [];
  bool _searching = false;

  /// True when the last search finished with no matches.
  bool _noResults = false;

  static const _initialCamera = CameraPosition(
    // Parc Agrobiotech Lleida — the Liquid Galaxy home rig.
    target: LatLng(41.6069, 0.6231),
    zoom: 14,
  );

  @override
  void dispose() {
    _debounce?.cancel();
    _searchDebounce?.cancel();
    _searchCtrl.dispose();
    _searchFocus.dispose();
    _map?.dispose();
    super.dispose();
  }

  bool get _connected => ref.read(connectionProvider).isConnected;

  void _snack(String message) {
    if (!mounted) return;
    showAppSnack(context, message);
  }

  /// Converts a map zoom level into Google Earth's camera distance in metres.
  double _rangeForZoom(double zoom, double latitude) {
    const equatorMetresPerPixel = 156543.03392;
    final mpp = equatorMetresPerPixel * cos(latitude * pi / 180) / pow(2, zoom);
    return (mpp * 1000).clamp(150.0, 20000000.0);
  }

  void _onCameraMove(CameraPosition position) {
    _camera = position;
    // The rig has a single command channel (/tmp/query.txt); a flyTo written while an orbit plays would interrupt it, so never sync during orbit.
    if (_programmaticMove || _orbiting) return;
    _debounce?.cancel();
    _debounce = Timer(_syncDebounce, _syncCameraToRig);
  }

  Future<void> _syncCameraToRig() async {
    if (!_connected || _flyInFlight || _orbiting) return;
    _flyInFlight = true;
    try {
      final range = _rangeForZoom(_camera.zoom, _camera.target.latitude);
      _lastRange = range;
      await ref.read(flyToPointUseCaseProvider).call(
            latitude: _camera.target.latitude,
            longitude: _camera.target.longitude,
            range: range,
            tilt: _camera.tilt,
            heading: _camera.bearing,
          );
    } catch (e) {
      // A failed pan-sync shouldn't snackbar every gesture; the app bar icon already shows the connection is down.
      debugPrint('flyTo sync failed: $e');
    } finally {
      _flyInFlight = false;
    }
  }

  void _onSearchChanged(String query) {
    _searchDebounce?.cancel();
    if (query.trim().length < 2) {
      setState(() {
        _results = const [];
        _noResults = false;
      });
      return;
    }
    _searchDebounce = Timer(const Duration(milliseconds: 500), () {
      _runSearch(query);
    });
  }

  Future<void> _runSearch(String query) async {
    setState(() {
      _searching = true;
      _noResults = false;
    });
    try {
      final results = await ref.read(searchPlacesUseCaseProvider).call(query);
      if (mounted) {
        setState(() {
          _results = results;
          _noResults = results.isEmpty;
        });
      }
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  /// Fly the map and the rig to a search result and ring it with a 3D shape.
  Future<void> _goToPlace(PlaceAreaEntity place) async {
    _searchFocus.unfocus();
    _searchDebounce?.cancel();
    final target = LatLng(place.latitude, place.longitude);
    setState(() {
      _results = const [];
      _searchCtrl.text = place.shortName;
      _selected = target;
      _placeName = place.shortName;
    });

    // Move the phone's map to the place; the rig gets one explicit flyTo below.
    _programmaticMove = true;
    try {
      final s = place.south, n = place.north, w = place.west, e = place.east;
      if (s != null && n != null && w != null && e != null && s < n && w < e) {
        await _map?.animateCamera(CameraUpdate.newLatLngBounds(
          LatLngBounds(southwest: LatLng(s, w), northeast: LatLng(n, e)),
          48,
        ));
      } else {
        await _map?.animateCamera(CameraUpdate.newLatLngZoom(target, 12));
      }
    } catch (_) {
      await _map?.animateCamera(CameraUpdate.newLatLngZoom(target, 12));
    } finally {
      _programmaticMove = false;
    }

    if (!_connected) {
      _snack('Connect to the Liquid Galaxy rig first.');
      return;
    }

    setState(() => _busy = true);
    try {
      // Flying somewhere new ends the orbit; stop it before the flyTo, or its next tick would drag the camera straight back to the old place.
      if (_orbiting) {
        await ref.read(stopOrbitUseCaseProvider).call();
        if (mounted) setState(() => _orbiting = false);
      }

      final range = _rangeFor(place);
      _lastRange = range;
      await ref.read(flyToPointUseCaseProvider).call(
            latitude: place.latitude,
            longitude: place.longitude,
            range: range,
            tilt: 60,
          );

      // No boundary from OSM — fall back to a circle scaled to the view.
      final fallbackRadius = (range * 0.12).clamp(80.0, 20000.0);

      await ref.read(showAreaKmlUseCaseProvider).call(
            latitude: place.latitude,
            longitude: place.longitude,
            area: place,
            fallbackRadiusMeters: fallbackRadius,
            heightMeters: _heightFor(place, fallbackRadius),
            label: place.shortName,
          );
    } catch (e) {
      _snack('Could not send to the rig: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Camera distance for a place, from how wide its bounding box is.
  double _rangeFor(PlaceAreaEntity place) {
    final south = place.south, north = place.north;
    if (south == null || north == null) return 3000;
    final spanMeters = (north - south).abs() * 111320.0;
    return (spanMeters * 1.6).clamp(1200.0, 20000000.0);
  }

  /// Height of the 3D shape, scaled to how big the place is.
  double _heightFor(PlaceAreaEntity? area, double fallbackRadius) {
    if (area == null || !area.hasBoundary) return fallbackRadius * 0.8;
    final south = area.south, north = area.north;
    if (south == null || north == null) return fallbackRadius * 0.8;
    final spanMeters = (north - south).abs() * 111320.0;
    return (spanMeters * 0.12).clamp(120.0, 60000.0);
  }

  Future<void> _toggleOrbit() async {
    if (!_connected) {
      _snack('Connect to the Liquid Galaxy rig first.');
      return;
    }

    // A pending pan-sync would fire mid-orbit and fly the rig away; cancel it before we start.
    _debounce?.cancel();

    // Orbit the settled target/range rather than a still-animating camera: prefer the searched place and the range we flew there with.
    final target = _selected ?? _camera.target;
    final range = _lastRange ?? _rangeForZoom(_camera.zoom, target.latitude);

    setState(() => _busy = true);
    try {
      if (_orbiting) {
        await ref.read(stopOrbitUseCaseProvider).call();
        if (mounted) setState(() => _orbiting = false);
      } else {
        // Runs until stopped — from this button, or by searching a new place.
        await ref.read(orbitAroundUseCaseProvider).call(
              latitude: target.latitude,
              longitude: target.longitude,
              range: range,
              durationSeconds: _secondsPerRevolution,
            );
        if (mounted) setState(() => _orbiting = true);
      }
    } catch (e) {
      _snack('Orbit failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _clear() async {
    _debounce?.cancel();
    setState(() {
      _selected = null;
      _orbiting = false;
    });
    if (!_connected) return;
    try {
      await ref.read(stopOrbitUseCaseProvider).call();
      await ref.read(cleanKmlUseCaseProvider).call();
      _snack('Cleared the rig');
    } catch (e) {
      _snack('Clear failed: $e');
    }
  }

  /// Shared floating-panel look for the widgets overlaid on the map.
  BoxDecoration _panelDecoration(AppPalette p,
      {double alpha = 0.95, double radius = 14}) {
    return BoxDecoration(
      color: p.surface.withValues(alpha: alpha),
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: p.border),
    );
  }

  Widget _searchField(AppPalette p) {
    return Container(
      decoration: _panelDecoration(p),
      child: TextField(
        controller: _searchCtrl,
        focusNode: _searchFocus,
        onChanged: _onSearchChanged,
        textInputAction: TextInputAction.search,
        onSubmitted: (q) {
          _searchDebounce?.cancel();
          _runSearch(q);
        },
        style: TextStyle(
          color: p.onSurface,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
        decoration: InputDecoration(
          hintText: 'Search a city…',
          hintStyle: TextStyle(color: p.onSurfaceMuted, fontSize: 14),
          prefixIcon: Icon(Icons.search_rounded, color: p.onSurfaceMuted),
          suffixIcon: _searching
              ? Padding(
                  padding: const EdgeInsets.all(14),
                  child: SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: p.primary,
                    ),
                  ),
                )
              : (_searchCtrl.text.isEmpty
                  ? null
                  : IconButton(
                      tooltip: 'Clear search',
                      icon: Icon(Icons.close_rounded,
                          size: 18, color: p.onSurfaceMuted),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() {
                          _results = const [];
                          _noResults = false;
                        });
                      },
                    )),
          border: InputBorder.none,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        ),
      ),
    );
  }

  Widget _noResultsHint(AppPalette p) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: _panelDecoration(p),
      child: Text(
        'No city found — try a city or town name',
        style: TextStyle(color: p.onSurfaceMuted, fontSize: 13),
      ),
    );
  }

  Widget _suggestions(AppPalette p) {
    return Container(
      margin: const EdgeInsets.only(top: 6),
      constraints: const BoxConstraints(maxHeight: 250),
      decoration: _panelDecoration(p, alpha: 0.97),
      child: ListView.separated(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: _results.length,
        separatorBuilder: (_, __) => Divider(height: 1, color: p.border),
        itemBuilder: (_, i) {
          final r = _results[i];
          return ListTile(
            dense: true,
            leading:
                Icon(Icons.place_rounded, color: p.primaryBright, size: 20),
            title: Text(
              r.shortName,
              style: TextStyle(
                color: p.onSurface,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
            subtitle: Text(
              r.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: p.onSurfaceMuted, fontSize: 12),
            ),
            onTap: () => _goToPlace(r),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = context.palette;
    final connected = ref.watch(connectionProvider).isConnected;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Map'),
        // The map can't glow behind the bar; the search field's surface tone makes the two read as one panel instead of a flat black strip.
        backgroundColor: p.surface,
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => ref
              .read(navigationProvider.notifier)
              .setIndex(NavigationIndex.home),
        ),
        actions: [
          IconButton(
            tooltip: connected
                ? 'Liquid Galaxy — live'
                : 'Not connected — open Settings',
            icon: Icon(
              connected ? Icons.link_rounded : Icons.link_off_rounded,
              color: connected ? p.success : p.onSurfaceMuted,
            ),
            onPressed: connected
                ? null
                : () => ref
                    .read(navigationProvider.notifier)
                    .setIndex(NavigationIndex.settings),
          ),
          IconButton(
            tooltip: 'Clear the rig',
            icon: const Icon(Icons.layers_clear_outlined),
            onPressed: _clear,
          ),
        ],
      ),
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: _initialCamera,
            onMapCreated: (c) => _map = c,
            onCameraMove: _onCameraMove,
            // Tapping the map just dismisses the keyboard and suggestions.
            onTap: (_) {
              _searchFocus.unfocus();
              if (_results.isNotEmpty) setState(() => _results = const []);
            },
            mapType: MapType.hybrid,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            markers: {
              if (_selected != null)
                Marker(
                  markerId: const MarkerId('selected'),
                  position: _selected!,
                ),
            },
          ),
          Positioned(
            left: 16,
            right: 16,
            top: 12,
            child: Column(
              children: [
                _searchField(p),
                if (_results.isNotEmpty) _suggestions(p),
                if (_noResults && _results.isEmpty) _noResultsHint(p),
              ],
            ),
          ),
          if (_busy)
            Positioned(
              top: 12,
              right: 16,
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2.4, color: p.primary),
              ),
            ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: _panelDecoration(p, alpha: 0.92, radius: 12),
                  child: Text(
                    _selected == null
                        ? 'Search a place to fly the rig there'
                        : _placeName ??
                            '${_selected!.latitude.toStringAsFixed(5)}, '
                                '${_selected!.longitude.toStringAsFixed(5)}',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: p.onSurface,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                AppButton(
                  label: _orbiting ? 'Stop Orbit' : 'Orbit This Place',
                  icon:
                      _orbiting ? Icons.stop_rounded : Icons.threesixty_rounded,
                  variant: _orbiting
                      ? AppButtonVariant.tonal
                      : AppButtonVariant.primary,
                  onPressed: _busy ? null : _toggleOrbit,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
