import 'package:flutter_test/flutter_test.dart';
import 'package:lg_rpg_controller/data/models/fly_to_model.dart';
import 'package:lg_rpg_controller/domain/entities/fly_to_entity.dart';

void main() {
  test('should convert MyModel to Entity correctly', () {
    // Act
    const model = FlyToModel(
        latitude: 10.0,
        longitude: 20.0,
        altitude: 100,
        range: 1000,
        tilt: 0,
        heading: 10,
        altitudeMode: 'absolute');

    // Act
    final entity = model.toEntity();

    // Assert
    expect(entity.latitude, model.latitude);
    expect(entity.longitude, model.longitude);
    expect(entity.altitude, model.altitude);
    expect(entity.range, model.range);
    expect(entity.tilt, model.tilt);
    expect(entity.heading, model.heading);
    expect(entity.altitudeMode, model.altitudeMode);
  });
  test('should create Model from Entity correctly', () {
    // Act
    const entity = FlyToEntity(
        latitude: 10.0,
        longitude: 20.0,
        altitude: 100,
        range: 1000,
        tilt: 0,
        heading: 10,
        altitudeMode: 'absolute');

    // Act
    final model = FlyToModel.fromEntity(entity);

    // Assert
    expect(model.latitude, entity.latitude);

    expect(model.longitude, entity.longitude);

    expect(model.altitude, entity.altitude);
    expect(model.range, entity.range);
    expect(model.tilt, entity.tilt);
    expect(model.heading, entity.heading);
    expect(model.altitudeMode, entity.altitudeMode);
  });

  test('should create model from Google Places JSON', () {
    // 1. Arrange: Mock the JSON response from API
    final json = {
      'lat': -33.86,
      'lng': 151.20,
    };

    // 2. Act
    final model = FlyToModel.fromPlacesApiJson(json);

    // 3. Assert
    expect(model.latitude, -33.86);
    expect(model.longitude, 151.20);
    expect(model.altitude, 0);
    expect(model.range, 1000);
    expect(model.tilt, 45);
    expect(model.heading, 0);
  });

  test('should convert model to JSON correctly', () {
    // 1. Arrange
    const model = FlyToModel(
        latitude: 10.0,
        longitude: 20.0,
        altitude: 100,
        range: 1000,
        tilt: 0,
        heading: 10,
        altitudeMode: 'relativeToGround');
    // 2. Act
    final json = model.toJson();

    // 3. Assert
    expect(json['latitude'], 10.0);
    expect(json['longitude'], 20.0);
    expect(json['altitude'], 100);
    expect(json['range'], 1000);
    expect(json['altitudeMode'], 'relativeToGround');
    expect(json['tilt'], 0);
    expect(json['heading'], 10);
  });
}
