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

  Future<void> flyTo(FlyToEntity command);
  Future<void> sendQuery(String query);

  /// Upload KML content via SFTP to /var/www/html/
  Future<void> uploadKml(String content, String fileName);

  /// Send KML content to a specific slave screen.
  Future<void> sendKmlToSlave(String kmlContent, int screen);

  /// Send KML content to master.kml for synchronized display across all screens.
  Future<void> sendKmlToMaster(String kmlContent);

  /// Clean all KML content from LG (master.kml, all slave files, and navigation).
  Future<void> cleanAllKml();

  /// Clear navigation query (flyto commands in /tmp/query.txt).
  Future<void> clearNavigation();

  Future<void> sendLogo({String assetPath = 'image/logo.png'});

  /// Clear logo from the leftmost screen.
  Future<void> cleanLogo();

  /// Send HTML content as a balloon overlay to the rightmost screen.
  Future<void> sendHtmlOverlay(String htmlContent);

  /// Start an orbit animation (KML Tour) around a point of interest.
  Future<void> orbit(OrbitEntity orbitParams);

  /// Reboot all LG machines. Returns true if all succeeded.
  Future<bool> rebootAll();

  /// Shutdown all LG machines. Returns true if all succeeded.
  Future<bool> shutdownAll();

  /// Relaunch Google Earth on all machines (via display manager restart).
  Future<void> relaunch();

  /// Force refresh a specific screen by toggling refresh interval.
  Future<void> forceRefresh(int screenNumber);

  Future<void> stopServer();

  Future<void> startServer();

  Future<void> closeBrowser();

  Future<void> launchBrowser();
}
