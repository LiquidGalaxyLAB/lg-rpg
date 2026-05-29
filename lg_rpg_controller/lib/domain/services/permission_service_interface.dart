abstract class IPermissionService {
  Future<bool> checkLocationPermission();
  Future<bool> requestLocationPermission();
}
