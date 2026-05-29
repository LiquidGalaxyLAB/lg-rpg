/// Represents parameters for an orbit animation around a point of interest.
/// Used by the LG Orbit service to generate KML Tours.
class OrbitEntity {
  final double latitude;
  final double longitude;
  final double altitude;
  final double range;
  final double tilt;
  final double heading;

  /// Duration of the orbit in seconds (one full 360° rotation).
  final int duration;

  const OrbitEntity({
    required this.latitude,
    required this.longitude,
    this.altitude = 0,
    this.range = 5000,
    this.tilt = 60,
    this.heading = 0,
    this.duration = 30,
  });

  /// Creates a copy with modified fields.
  OrbitEntity copyWith({
    double? latitude,
    double? longitude,
    double? altitude,
    double? range,
    double? tilt,
    double? heading,
    int? duration,
  }) {
    return OrbitEntity(
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      altitude: altitude ?? this.altitude,
      range: range ?? this.range,
      tilt: tilt ?? this.tilt,
      heading: heading ?? this.heading,
      duration: duration ?? this.duration,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;

    return other is OrbitEntity &&
        other.latitude == latitude &&
        other.longitude == longitude &&
        other.altitude == altitude &&
        other.range == range &&
        other.tilt == tilt &&
        other.heading == heading &&
        other.duration == duration;
  }

  @override
  int get hashCode {
    return latitude.hashCode ^
        longitude.hashCode ^
        altitude.hashCode ^
        range.hashCode ^
        tilt.hashCode ^
        heading.hashCode ^
        duration.hashCode;
  }
}
