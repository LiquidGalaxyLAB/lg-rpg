import 'package:equatable/equatable.dart';

/// A single lon/lat pair, ordered lon-first to match both GeoJSON and KML so no axis swapping is needed on the way through.
class GeoPoint extends Equatable {
  final double lon;
  final double lat;

  const GeoPoint(this.lon, this.lat);

  @override
  List<Object?> get props => [lon, lat];
}

/// A real-world place and its boundary from OpenStreetMap; [rings] is empty when no boundary exists, and callers then draw a circle.
class PlaceAreaEntity extends Equatable {
  /// Display name, e.g. "Lleida, Segrià, Lleida, Catalonia, Spain".
  final String name;

  /// Short label, e.g. "Lleida".
  final String shortName;

  final double latitude;
  final double longitude;

  /// Boundary rings in lon/lat. Empty if OSM had no polygon.
  final List<List<GeoPoint>> rings;

  /// OSM's bounding box, used to size the fallback circle and pick a sensible camera range even when [rings] is empty.
  final double? south;
  final double? north;
  final double? west;
  final double? east;

  const PlaceAreaEntity({
    required this.name,
    required this.shortName,
    required this.latitude,
    required this.longitude,
    this.rings = const [],
    this.south,
    this.north,
    this.west,
    this.east,
  });

  bool get hasBoundary => rings.isNotEmpty;

  @override
  List<Object?> get props =>
      [name, shortName, latitude, longitude, rings, south, north, west, east];
}
