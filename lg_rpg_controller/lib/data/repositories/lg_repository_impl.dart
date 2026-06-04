import 'package:flutter/services.dart';
import 'package:lg_rpg_controller/core/constant/log_service.dart';

import '../datasources/local_storage_source.dart';
import '../../domain/services/ssh_service_interface.dart';
import '../../domain/entities/connection_entity.dart';
import '../../domain/entities/fly_to_entity.dart';
import '../../domain/entities/orbit_entity.dart';
import '../../domain/repositories/lg_repository.dart';

class LgRepositoryImpl implements LGRepository {
  final log = LogService();
  final ISshService _sshService;
  final LocalStorageDataSource _storageDataSource;

  /// Cached screen number (loaded from storage on init)
  int _screenNumber = 3;

  LgRepositoryImpl(this._sshService, this._storageDataSource) {
    _loadScreenNumber();
  }

  Future<void> _loadScreenNumber() async {
    final settings = await _storageDataSource.loadSettings();
    if (settings != null) {
      _screenNumber = settings.screenNumber;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CONNECTION MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  @override
  bool get isConnected => _sshService.isConnected;

  @override
  int get screenNumber => _screenNumber;

  @override
  Future<void> connect(
      String ip, String username, String password, int port) async {
    await _sshService.connect(ip, password, username, port);
  }

  @override
  Future<void> disconnect() async {
    await _sshService.disconnect();
  }

  // ─────────────────────────────────────────────────────────────
  // SETTINGS PERSISTENCE
  // ─────────────────────────────────────────────────────────────

  @override
  Future<void> storeSettings(
      String ip, String username, String password, int port,
      {int screenNumber = 3}) async {
    _screenNumber = screenNumber;
    await _storageDataSource.saveSettings(ConnectionEntity(
      ip: ip,
      username: username,
      password: password,
      port: port,
      screenNumber: screenNumber,
    ));
  }

  @override
  Future<ConnectionEntity?> getSettings() async {
    return await _storageDataSource.loadSettings();
  }

  @override
  Future<void> startServer() async {
    try {
      await _execute(
          'cd ~/lg-rpg-server && chmod +x lg-launch.sh && nohup bash -l ./lg-launch.sh $screenNumber > launch.log 2>&1 &');
      log.i('LG server started successfully');
    } catch (e) {
      log.e(e.toString());
    }
  }

  @override
  Future<void> stopServer() async {
    try {
      await _execute(
          'cd ~/lg-rpg-server && chmod +x lg-stop.sh && nohup bash -l ./lg-stop.sh $screenNumber > stop.log 2>&1 &');
    } catch (e) {
      log.e(e.toString());
    }
  }

  @override
  Future<void> setScreenNumber(int screens) async {
    _screenNumber = screens;
    final current = await _storageDataSource.loadSettings();
    if (current != null) {
      await _storageDataSource
          .saveSettings(current.copyWith(screenNumber: screens));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // HELPER METHODS (DRY)
  // ─────────────────────────────────────────────────────────────

  /// Execute command with error handling
  Future<void> _execute(String cmd) async {
    try {
      await _sshService.execute(cmd);
    } catch (e) {
      log.e('LG Command Error: $e');
      rethrow;
    }
  }

  /// Calculate leftmost screen for logo placement (DATA Spaces pattern)
  int _calculateLeftMostScreen(int screens) {
    if (screens == 1) return 1;
    return (screens / 2).floor() + 2;
  }

  /// Calculate rightmost screen for balloon placement
  int _calculateRightMostScreen(int screens) {
    if (screens == 1) return 1;
    return (screens / 2).floor() + 1;
  }

  /// Get password safely (for sudo commands)
  String get _password => _sshService.password ?? '';

  /// Empty KML template
  static const String _emptyKml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Empty</name>
  </Document>
</kml>''';

  // ─────────────────────────────────────────────────────────────
  // NAVIGATION COMMANDS
  // ─────────────────────────────────────────────────────────────

  @override
  Future<void> flyTo(FlyToEntity command) async {
    final kml = 'flytoview=<LookAt>'
        '<longitude>${command.longitude}</longitude>'
        '<latitude>${command.latitude}</latitude>'
        '<altitude>${command.altitude}</altitude>'
        '<heading>${command.heading}</heading>'
        '<tilt>${command.tilt}</tilt>'
        '<range>${command.range}</range>'
        '<gx:altitudeMode>${command.altitudeMode}</gx:altitudeMode>'
        '</LookAt>';
    await sendQuery(kml);
  }

  @override
  Future<void> sendQuery(String query) async {
    await _execute('echo "$query" > /tmp/query.txt');
  }

  // ─────────────────────────────────────────────────────────────
  // KML OPERATIONS
  // ─────────────────────────────────────────────────────────────

  @override
  Future<void> uploadKml(String content, String fileName) async {
    await _sshService.uploadViaSftp(content, '/var/www/html/$fileName');
  }

  @override
  Future<void> sendKmlToSlave(String kmlContent, int screen) async {
    // Escape single quotes in KML content
    final safeKml = kmlContent.replaceAll("'", "\\'");
    await _execute("echo '$safeKml' > /var/www/html/kml/slave_$screen.kml");
  }

  @override
  Future<void> sendKmlToMaster(String kmlContent) async {
    // Send KML to master.kml for synchronized display across all screens
    final safeKml = kmlContent
        .replaceAll("'", "\\'")
        .replaceAll('\n', '')
        .replaceAll('\r', '');
    await _execute("mkdir -p /var/www/html/kml");
    await _execute("echo '$safeKml' > /var/www/html/kml/master.kml");
  }

  @override
  Future<void> cleanAllKml() async {
    // 1. Clear master.kml (synchronized content)
    await _execute("echo '$_emptyKml' > /var/www/html/kml/master.kml");

    // 2. Clear navigation commands
    await _execute('echo "" > /tmp/query.txt');

    // 3. Clean all slave screens (including logo screen)
    for (int i = 1; i <= _screenNumber; i++) {
      await _execute("echo '$_emptyKml' > /var/www/html/kml/slave_$i.kml");
    }
  }

  @override
  Future<void> clearNavigation() async {
    // Clears only the navigation query (flyto commands)
    await _execute('echo "" > /tmp/query.txt');
  }

  // ─────────────────────────────────────────────────────────────
  // VISUAL ELEMENTS (LOGO, OVERLAYS, TOURS)
  // ─────────────────────────────────────────────────────────────

  @override
  Future<void> sendLogo({String assetPath = 'image/logo.png'}) async {
    final leftMost = _calculateLeftMostScreen(_screenNumber);

    // 1. Upload logo image via SFTP to /var/www/html/
    final ByteData data = await rootBundle.load('assets/$assetPath');
    final Uint8List bytes = data.buffer.asUint8List();
    await _sshService.uploadBytesViaSftp(bytes, '/var/www/html/lg_logo.png');
    await _execute('chmod 644 /var/www/html/lg_logo.png');

    // 2. Create KML referencing the uploaded image via HTTP
    const logoKml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <ScreenOverlay>
    <name>Logo</name>
    <Icon><href>http://lg1:81/lg_logo.png</href></Icon>
    <overlayXY x="0" y="1" xunits="fraction" yunits="fraction"/>
    <screenXY x="0.02" y="0.95" xunits="fraction" yunits="fraction"/>
    <size x="0.2" y="0" xunits="fraction" yunits="fraction"/>
  </ScreenOverlay>
</kml>''';

    await sendKmlToSlave(logoKml, leftMost);
  }

  @override
  Future<void> cleanLogo() async {
    final leftMost = _calculateLeftMostScreen(_screenNumber);
    await sendKmlToSlave(_emptyKml, leftMost);
  }

  @override
  Future<void> sendHtmlOverlay(String htmlContent) async {
    final rightMost = _calculateRightMostScreen(_screenNumber);

    // Wrap HTML in a KML Placemark with BalloonStyle
    final balloonKml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>HTML Overlay</name>
    <Style id="balloonStyle">
      <BalloonStyle>
        <text><![CDATA[$htmlContent]]></text>
        <bgColor>ff1a1a1a</bgColor>
        <textColor>ffffffff</textColor>
      </BalloonStyle>
    </Style>
    <Placemark>
      <name>Info</name>
      <styleUrl>#balloonStyle</styleUrl>
      <gx:balloonVisibility>1</gx:balloonVisibility>
      <Point>
        <coordinates>0,0,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>''';

    await sendKmlToSlave(balloonKml, rightMost);
  }

  @override
  Future<void> orbit(OrbitEntity orbitParams) async {
    // Generate KML Tour for orbit animation
    // Each step rotates heading by a small increment
    final int steps =
        orbitParams.duration * 2; // 2 steps per second for smoothness
    final double headingIncrement = 360.0 / steps;
    final double flyDuration = orbitParams.duration / steps;

    final StringBuffer tourSteps = StringBuffer();
    double currentHeading = orbitParams.heading;

    for (int i = 0; i < steps; i++) {
      tourSteps.write('''
      <gx:FlyTo>
        <gx:duration>$flyDuration</gx:duration>
        <gx:flyToMode>smooth</gx:flyToMode>
        <LookAt>
          <longitude>${orbitParams.longitude}</longitude>
          <latitude>${orbitParams.latitude}</latitude>
          <altitude>${orbitParams.altitude}</altitude>
          <heading>$currentHeading</heading>
          <tilt>${orbitParams.tilt}</tilt>
          <range>${orbitParams.range}</range>
          <gx:altitudeMode>relativeToGround</gx:altitudeMode>
        </LookAt>
      </gx:FlyTo>
''');
      currentHeading = (currentHeading + headingIncrement) % 360;
    }

    final orbitKml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <gx:Tour>
    <name>Orbit</name>
    <gx:Playlist>
$tourSteps
    </gx:Playlist>
  </gx:Tour>
</kml>''';

    // Send as a query to trigger tour playback
    await sendQuery('playtour=Orbit');
    await uploadKml(orbitKml, 'orbit_tour.kml');
  }

  // ─────────────────────────────────────────────────────────────
  // SYSTEM CONTROLS
  // ─────────────────────────────────────────────────────────────

  @override
  Future<bool> rebootAll() async {
    if (_password.isEmpty) {
      throw Exception('No password available for reboot command');
    }

    bool allSuccessful = true;

    // Reboot slaves first (from highest to lowest), then master
    for (int i = _screenNumber; i >= 1; i--) {
      try {
        final rebootCmd =
            'sshpass -p $_password ssh -t lg$i "echo $_password | sudo -S reboot"';
        await _execute(rebootCmd);

        if (i > 1) {
          await Future.delayed(const Duration(milliseconds: 200));
        }
      } catch (e) {
        log.e('Reboot lg$i failed: $e');
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  @override
  Future<bool> shutdownAll() async {
    if (_password.isEmpty) {
      throw Exception('No password available for shutdown command');
    }

    bool allSuccessful = true;

    // Shutdown slaves first, then master
    for (int i = _screenNumber; i >= 1; i--) {
      try {
        final shutdownCmd =
            'sshpass -p $_password ssh -t lg$i "echo $_password | sudo -S shutdown now"';
        await _execute(shutdownCmd);

        if (i > 1) {
          await Future.delayed(const Duration(milliseconds: 200));
        }
      } catch (e) {
        log.e('Shutdown lg$i failed: $e');
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }

  @override
  Future<void> relaunch() async {
    if (_password.isEmpty) {
      throw Exception('No password available for relaunch command');
    }

    // Restart display manager on master (propagates to slaves)
    final relaunchCmd = '''
RELAUNCH_CMD="\\
if [ -f /etc/init/lxdm.conf ]; then
  export SERVICE=lxdm
elif [ -f /etc/init/lightdm.conf ]; then
  export SERVICE=lightdm
else
  exit 1
fi
if [[ \\\$(service \\\$SERVICE status) =~ 'stop' ]]; then
  echo $_password | sudo -S service \\\${SERVICE} start
else
  echo $_password | sudo -S service \\\${SERVICE} restart
fi
" && sshpass -p $_password ssh -x -t lg@lg1 "\$RELAUNCH_CMD"''';

    await _execute(relaunchCmd);
  }

  @override
  Future<void> forceRefresh(int screenNumber) async {
    if (_password.isEmpty) return;

    // Set refresh interval
    final search =
        '<href>##LG_PHPIFACE##kml\\\\/slave_$screenNumber.kml</\\\\/href>';
    final replace =
        '<href>##LG_PHPIFACE##kml\\\\/slave_$screenNumber.kml</\\\\/href>'
        '<refreshMode>onInterval</\\\\/refreshMode><refreshInterval>2</\\\\/refreshInterval>';

    final setCmd = 'echo $_password | sudo -S sed -i "s|$search|$replace|" '
        '~/earth/kml/slave/myplaces.kml';
    await _execute('sshpass -p $_password ssh -t lg$screenNumber \'$setCmd\'');

    // Remove refresh interval
    final removeSearch =
        '<href>##LG_PHPIFACE##kml\\\\/slave_$screenNumber.kml</\\\\/href>'
        '<refreshMode>onInterval</\\\\/refreshMode><refreshInterval>[0-9]+</\\\\/refreshInterval>';
    final removeReplace =
        '<href>##LG_PHPIFACE##kml\\\\/slave_$screenNumber.kml</\\\\/href>';

    final removeCmd =
        'echo $_password | sudo -S sed -i "s|$removeSearch|$removeReplace|" '
        '~/earth/kml/slave/myplaces.kml';
    await _execute(
        'sshpass -p $_password ssh -t lg$screenNumber \'$removeCmd\'');
  }
}
