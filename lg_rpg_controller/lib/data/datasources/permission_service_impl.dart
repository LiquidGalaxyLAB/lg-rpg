import 'package:permission_handler/permission_handler.dart';
import '../../domain/services/permission_service_interface.dart';

class PermissionServiceImpl implements IPermissionService {
  @override
  Future<bool> checkLocationPermission() async {
    final status = await Permission.location.status;
    return status.isGranted;
  }

  @override
  Future<bool> requestLocationPermission() async {
    final result = await Permission.location.request();
    return result.isGranted;
  }
}
