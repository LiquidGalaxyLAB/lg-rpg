class FlyToEntity {
  final double latitude;
  final double longitude;
  final double altitude;
  final double range;
  final double tilt;
  final double heading;
  final String altitudeMode;

  const FlyToEntity({
    required this.latitude,
    required this.longitude,
    required this.altitude,
    required this.range,
    required this.tilt,
    required this.heading,
    this.altitudeMode = 'relativeToGround',
  });

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;

    return other is FlyToEntity &&
        other.latitude == latitude &&
        other.longitude == longitude &&
        other.altitude == altitude &&
        other.range == range &&
        other.tilt == tilt &&
        other.heading == heading &&
        other.altitudeMode == altitudeMode;
  }

  @override
  int get hashCode {
    return latitude.hashCode ^
        longitude.hashCode ^
        altitude.hashCode ^
        range.hashCode ^
        tilt.hashCode ^
        heading.hashCode ^
        altitudeMode.hashCode;
  }
}
