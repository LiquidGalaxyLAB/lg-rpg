import 'package:equatable/equatable.dart';

class FlyToEntity extends Equatable {
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

  FlyToEntity copyWith(
      {double? latitude,
      double? longitude,
      double? altitude,
      double? range,
      double? tilt,
      double? heading,
      String? altitudeMode}) {
    return FlyToEntity(
        latitude: latitude ?? this.latitude,
        longitude: longitude ?? this.longitude,
        altitude: altitude ?? this.altitude,
        range: range ?? this.range,
        tilt: tilt ?? this.tilt,
        heading: heading ?? this.heading,
        altitudeMode: altitudeMode ?? this.altitudeMode);
  }

  @override
  List<Object?> get props => [
        latitude,
        longitude,
        altitude,
        range,
        tilt,
        heading,
        altitudeMode,
      ];
}
