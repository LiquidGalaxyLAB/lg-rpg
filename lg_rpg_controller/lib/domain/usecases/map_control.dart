import 'dart:math';

import '../entities/fly_to_entity.dart';
import '../entities/orbit_entity.dart';
import '../entities/place_area_entity.dart';
import '../repositories/lg_repository.dart';
import '../repositories/place_repository.dart';

// Drives Google Earth from the controller's map: fly to a point, highlight the tapped place as a 3D shape, and orbit it.

/// Flies the rig's view to a point on the globe.
class FlyToPointUseCase {
  final LGRepository repository;
  FlyToPointUseCase(this.repository);

  Future<void> call({
    required double latitude,
    required double longitude,
    required double range,
    double tilt = 45,
    double heading = 0,
  }) {
    return repository.flyTo(
      FlyToEntity(
        latitude: latitude,
        longitude: longitude,
        altitude: 0,
        range: range,
        tilt: tilt,
        heading: heading,
      ),
    );
  }
}

/// Shows the tapped place as a translucent 3D shape, using its real boundary when available or a circle otherwise.
class ShowAreaKmlUseCase {
  final LGRepository repository;
  ShowAreaKmlUseCase(this.repository);

  static const _circleSides = 72;

  /// Cap on boundary points; denser rings get thinned for performance.
  static const _maxRingPoints = 2000;

  // KML colour order is aabbggrr (reversed from CSS). Cyan #22D3EE.
  static const _kmlOutline = 'ffeed322'; // opaque cyan
  static const _kmlFill = '66eed322'; // ~40% cyan

  Future<void> call({
    required double latitude,
    required double longitude,
    PlaceAreaEntity? area,
    double fallbackRadiusMeters = 500,
    double heightMeters = 400,
    String label = 'Selected Area',
  }) {
    return repository.sendKml(
      buildKml(
        latitude: latitude,
        longitude: longitude,
        area: area,
        fallbackRadiusMeters: fallbackRadiusMeters,
        heightMeters: heightMeters,
        label: label,
      ),
      'area',
    );
  }

  /// Exposed for testing: the geometry is the part worth checking.
  static String buildKml({
    required double latitude,
    required double longitude,
    PlaceAreaEntity? area,
    double fallbackRadiusMeters = 500,
    double heightMeters = 400,
    String label = 'Selected Area',
  }) {
    final rings = (area != null && area.rings.isNotEmpty)
        ? area.rings.map((r) => _thin(r, _maxRingPoints)).toList()
        : [_circle(latitude, longitude, fallbackRadiusMeters)];

    final h = heightMeters.toStringAsFixed(0);
    final placemarks = StringBuffer();
    for (final ring in rings) {
      final coords = ring.map((p) => '${_f(p.lon)},${_f(p.lat)},$h').join(' ');
      placemarks.write('''
    <Placemark>
      <name>${_escape(label)}</name>
      <styleUrl>#areaStyle</styleUrl>
      <Polygon>
        <extrude>1</extrude>
        <altitudeMode>relativeToGround</altitudeMode>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>$coords</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
''');
    }

    return '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Area of Interest</name>
    <Style id="areaStyle">
      <LineStyle><color>$_kmlOutline</color><width>3</width></LineStyle>
      <PolyStyle><color>$_kmlFill</color></PolyStyle>
    </Style>
$placemarks    <Placemark>
      <name>${_escape(label)}</name>
      <Point>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${_f(longitude)},${_f(latitude)},$h</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>''';
  }

  static String _f(double v) => v.toStringAsFixed(6);

  /// KML is XML: an unescaped & or < in a place name breaks the whole document.
  static String _escape(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  /// Evenly drops vertices until the ring fits [max], always keeping the first and last so it stays closed.
  static List<GeoPoint> _thin(List<GeoPoint> ring, int max) {
    if (ring.length <= max) return ring;
    final step = (ring.length / max).ceil();
    final out = <GeoPoint>[];
    for (int i = 0; i < ring.length; i += step) {
      out.add(ring[i]);
    }
    if (out.last != ring.last) out.add(ring.last);
    return out;
  }

  /// Builds a closed circle of points around a centre.
  static List<GeoPoint> _circle(double lat, double lng, double radiusMeters) {
    const metresPerDegreeLat = 111320.0;
    final dLat = radiusMeters / metresPerDegreeLat;
    // Guard the poles, where cos(lat) -> 0 and the offset would blow up.
    final cosLat = cos(lat * pi / 180).abs().clamp(0.01, 1.0);
    final dLng = radiusMeters / (metresPerDegreeLat * cosLat);

    final pts = <GeoPoint>[];
    for (int i = 0; i <= _circleSides; i++) {
      final theta = 2 * pi * (i % _circleSides) / _circleSides;
      pts.add(GeoPoint(lng + dLng * cos(theta), lat + dLat * sin(theta)));
    }
    return pts;
  }
}

/// Starts a 360-degree orbit around a point (a KML tour played on the rig).
class OrbitAroundUseCase {
  final LGRepository repository;
  OrbitAroundUseCase(this.repository);

  Future<void> call({
    required double latitude,
    required double longitude,
    double range = 2000,
    double tilt = 60,
    int durationSeconds = 30,
  }) {
    return repository.orbit(
      OrbitEntity(
        latitude: latitude,
        longitude: longitude,
        range: range,
        tilt: tilt,
        duration: durationSeconds,
      ),
    );
  }
}

/// Stops a running orbit tour.
class StopOrbitUseCase {
  final LGRepository repository;
  StopOrbitUseCase(this.repository);

  Future<void> call() => repository.stopTour();
}

/// Searches places by name (city, country, landmark) with their boundaries.
class SearchPlacesUseCase {
  final PlaceRepository repository;
  SearchPlacesUseCase(this.repository);

  Future<List<PlaceAreaEntity>> call(String query) {
    return repository.searchPlaces(query);
  }
}
