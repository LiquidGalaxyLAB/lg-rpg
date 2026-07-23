import '../entities/connection_entity.dart';
import '../entities/fly_to_entity.dart';
import '../entities/orbit_entity.dart';

abstract class LGRepository {
  bool get isConnected;

  /// Number of screens in the LG rig (default: 3).
  int get screenNumber;

  Future<void> connect(String ip, String username, String password, int port);
  Future<void> disconnect();

  Future<void> storeSettings(
      String ip, String username, String password, int port,
      {int? screenNumber});
  Future<ConnectionEntity?> getSettings();
  Future<void> setScreenNumber(int screens);

  /// Screen count from storage, or null when none saved yet; unlike [getSettings], this works before a full profile exists.
  Future<int?> getStoredScreenNumber();

  Future<void> flyTo(FlyToEntity command);
  Future<void> sendQuery(String query);

  /// Upload KML content via SFTP to /var/www/html/
  Future<void> uploadKml(String content, String fileName);

  /// Send KML content to a specific slave screen.
  Future<void> sendKmlToSlave(String kmlContent, int screen);

  /// Show a KML across the rig by uploading it and listing it in kmls.txt; never write master.kml — that breaks live updates until Earth restarts.
  Future<void> sendKml(String kmlContent, String name);

  /// Stop any running tour.
  Future<void> stopTour();

  /// Clear all displayed KML, including the logo.
  Future<void> cleanAllKml();

  Future<void> sendLogo({String assetPath = 'image/logo.png'});

  /// Start an orbit animation around a point of interest.
  Future<void> orbit(OrbitEntity orbitParams);

  /// Reboot all LG machines. Returns true if all succeeded.
  Future<bool> rebootAll();

  /// Shutdown all LG machines. Returns true if all succeeded.
  Future<bool> shutdownAll();

  /// Relaunch Google Earth on all machines (via display manager restart).
  Future<void> relaunch();

  /// Make slave screens reload their KML every 2 seconds; needs a reboot to take effect.
  Future<void> setRefresh();

  /// Undo [setRefresh]. Also needs a reboot to take effect.
  Future<void> resetRefresh();

  Future<void> stopServer();

  Future<void> startServer();

  Future<void> closeBrowser();

  Future<void> launchBrowser();
}
