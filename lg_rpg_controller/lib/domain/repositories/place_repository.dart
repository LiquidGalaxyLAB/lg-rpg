import '../entities/place_area_entity.dart';

/// Finds real-world places by name.
abstract class PlaceRepository {
  /// Places matching [query], best match first. Empty when nothing matches.
  Future<List<PlaceAreaEntity>> searchPlaces(String query);
}
