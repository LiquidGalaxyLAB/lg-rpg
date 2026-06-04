import 'package:equatable/equatable.dart';

class OrbitEntity extends Equatable {
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
  List<Object?> get props => [
        latitude,
        longitude,
        altitude,
        range,
        tilt,
        heading,
        duration,
      ];
}
