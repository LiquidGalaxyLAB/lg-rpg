import '../../domain/entities/fly_to_entity.dart';

/// Data layer model for FlyTo - handles JSON serialization
/// This separates data layer concerns from domain entities
class FlyToModel {
  final double latitude;
  final double longitude;
  final double altitude;
  final double range;
  final double tilt;
  final double heading;
  final String altitudeMode;

  const FlyToModel({
    required this.latitude,
    required this.longitude,
    required this.altitude,
    required this.range,
    required this.tilt,
    required this.heading,
    this.altitudeMode = 'relativeToGround',
  });

  /// Factory constructor to create FlyToModel from Google Places API response
  factory FlyToModel.fromPlacesApiJson(
    Map<String, dynamic> json, {
    double defaultAltitude = 0,
    double defaultRange = 1000,
    double defaultTilt = 45,
    double defaultHeading = 0,
  }) {
    return FlyToModel(
      latitude: (json['lat'] as num).toDouble(),
      longitude: (json['lng'] as num).toDouble(),
      altitude: defaultAltitude,
      range: defaultRange,
      tilt: defaultTilt,
      heading: defaultHeading,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'latitude': latitude,
      'longitude': longitude,
      'altitude': altitude,
      'range': range,
      'tilt': tilt,
      'heading': heading,
      'altitudeMode': altitudeMode,
    };
  }

  /// Convert to domain entity
  FlyToEntity toEntity() {
    return FlyToEntity(
      latitude: latitude,
      longitude: longitude,
      altitude: altitude,
      range: range,
      tilt: tilt,
      heading: heading,
      altitudeMode: altitudeMode,
    );
  }

  /// Create from domain entity
  factory FlyToModel.fromEntity(FlyToEntity entity) {
    return FlyToModel(
      latitude: entity.latitude,
      longitude: entity.longitude,
      altitude: entity.altitude,
      range: entity.range,
      tilt: entity.tilt,
      heading: entity.heading,
      altitudeMode: entity.altitudeMode,
    );
  }
}
