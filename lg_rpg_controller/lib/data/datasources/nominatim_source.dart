import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:lg_rpg_controller/core/constant/log_service.dart';
import 'package:lg_rpg_controller/domain/entities/place_area_entity.dart';

/// Searches cities/towns and their boundary polygons via OpenStreetMap's free Nominatim API (max 1 request per second).
class NominatimSource {
  final log = LogService();
  final http.Client _client;

  NominatimSource({http.Client? client}) : _client = client ?? http.Client();

  static const _host = 'nominatim.openstreetmap.org';

  /// Nominatim's policy requires a real identifier, not a generic UA.
  static const _userAgent =
      'LG-RPG-Controller/1.0 (Liquid Galaxy RPG; github.com/LiquidGalaxyLAB)';

  static const _minInterval = Duration(seconds: 1);
  DateTime _lastCall = DateTime.fromMillisecondsSinceEpoch(0);

  /// Searches places matching [query]. Returns an empty list on any failure.
  Future<List<PlaceAreaEntity>> search(String query, {int limit = 5}) async {
    if (query.trim().isEmpty) return const [];
    await _throttle();

    final uri = Uri.https(_host, '/search', {
      'format': 'jsonv2',
      'q': query.trim(),
      'limit': limit.toString(),
      // Cities/towns/villages only — country boundaries are too big for the rig.
      'featureType': 'settlement',
      'polygon_geojson': '1',
      // Simplify boundaries server-side; the rig can't show that detail anyway.
      'polygon_threshold': '0.005',
      'addressdetails': '1',
    });

    try {
      final res = await _client.get(uri, headers: {
        'User-Agent': _userAgent
      }).timeout(const Duration(seconds: 12));

      if (res.statusCode != 200) {
        log.w('Nominatim ${res.statusCode} for "$query"');
        return const [];
      }

      final body = jsonDecode(res.body);
      if (body is! List) return const [];

      return _dedupe(body
          .whereType<Map<String, dynamic>>()
          .map((item) => _parse(item, 0, 0))
          .toList());
    } catch (e) {
      log.w('Nominatim search failed: $e');
      return const [];
    }
  }

  /// OSM often lists a city both as a point and as a boundary; collapse those duplicates, keeping the copy with the real boundary polygon.
  List<PlaceAreaEntity> _dedupe(List<PlaceAreaEntity> results) {
    final out = <PlaceAreaEntity>[];
    for (final r in results) {
      final i = out.indexWhere((o) =>
          o.shortName.toLowerCase() == r.shortName.toLowerCase() &&
          (o.latitude - r.latitude).abs() < 0.5 &&
          (o.longitude - r.longitude).abs() < 0.5);
      if (i == -1) {
        out.add(r);
      } else if (!out[i].hasBoundary && r.hasBoundary) {
        out[i] = r;
      }
    }
    return out;
  }

  Future<void> _throttle() async {
    final since = DateTime.now().difference(_lastCall);
    if (since < _minInterval) await Future.delayed(_minInterval - since);
    _lastCall = DateTime.now();
  }

  PlaceAreaEntity _parse(Map<String, dynamic> body, double lat, double lon) {
    final name = (body['display_name'] as String?) ?? 'Selected Area';
    final shortName = _shortNameOf(body) ?? name.split(',').first.trim();

    // boundingbox arrives as [south, north, west, east], all as strings.
    final bbox = (body['boundingbox'] as List?)
        ?.map((e) => double.tryParse(e.toString()))
        .toList();

    return PlaceAreaEntity(
      name: name,
      shortName: shortName,
      latitude: double.tryParse('${body['lat']}') ?? lat,
      longitude: double.tryParse('${body['lon']}') ?? lon,
      rings: _ringsOf(body['geojson']),
      south: bbox != null && bbox.length == 4 ? bbox[0] : null,
      north: bbox != null && bbox.length == 4 ? bbox[1] : null,
      west: bbox != null && bbox.length == 4 ? bbox[2] : null,
      east: bbox != null && bbox.length == 4 ? bbox[3] : null,
    );
  }

  String? _shortNameOf(Map<String, dynamic> body) {
    final direct = body['name'];
    if (direct is String && direct.trim().isNotEmpty) return direct.trim();

    // Fall back through the address hierarchy, most specific first.
    final address = body['address'];
    if (address is Map) {
      for (final key in const [
        'city',
        'town',
        'village',
        'municipality',
        'county',
        'state',
        'country',
      ]) {
        final v = address[key];
        if (v is String && v.trim().isNotEmpty) return v.trim();
      }
    }
    return null;
  }

  /// Pulls the outer rings out of GeoJSON geometry; holes are ignored.
  List<List<GeoPoint>> _ringsOf(dynamic geojson) {
    if (geojson is! Map) return const [];
    final type = geojson['type'];
    final coords = geojson['coordinates'];

    switch (type) {
      case 'Polygon':
        final ring =
            _ring(coords is List && coords.isNotEmpty ? coords[0] : null);
        return ring.isEmpty ? const [] : [ring];
      case 'MultiPolygon':
        if (coords is! List) return const [];
        final out = <List<GeoPoint>>[];
        for (final polygon in coords) {
          if (polygon is List && polygon.isNotEmpty) {
            final ring = _ring(polygon[0]);
            if (ring.isNotEmpty) out.add(ring);
          }
        }
        return out;
      default:
        return const [];
    }
  }

  List<GeoPoint> _ring(dynamic raw) {
    if (raw is! List) return const [];
    final pts = <GeoPoint>[];
    for (final p in raw) {
      if (p is List && p.length >= 2) {
        final lon = (p[0] as num?)?.toDouble();
        final lat = (p[1] as num?)?.toDouble();
        if (lon != null && lat != null) pts.add(GeoPoint(lon, lat));
      }
    }
    if (pts.length < 3) return const [];
    // KML LinearRings must close; GeoJSON usually does already.
    if (pts.first != pts.last) pts.add(pts.first);
    return pts;
  }
}
