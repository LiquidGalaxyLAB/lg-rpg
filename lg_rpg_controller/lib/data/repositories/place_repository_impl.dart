import 'package:lg_rpg_controller/data/datasources/nominatim_source.dart';
import 'package:lg_rpg_controller/domain/entities/place_area_entity.dart';
import 'package:lg_rpg_controller/domain/repositories/place_repository.dart';

class PlaceRepositoryImpl implements PlaceRepository {
  final NominatimSource _source;

  PlaceRepositoryImpl(this._source);

  @override
  Future<List<PlaceAreaEntity>> searchPlaces(String query) {
    return _source.search(query);
  }
}
