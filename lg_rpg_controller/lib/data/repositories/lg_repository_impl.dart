import 'dart:async';

import 'package:flutter/services.dart';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
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

  /// Cached screen number, loaded from storage on init.
  int _screenNumber = 3;

  LgRepositoryImpl(this._sshService, this._storageDataSource) {
    _loadScreenNumber();
  }

  Future<void> _loadScreenNumber() async {
    // Read the standalone key, not the full profile: a screen count saved before the first successful connect has no profile around it yet.
    final screens = await _storageDataSource.getScreenNumber();
    if (screens != null) {
      _screenNumber = screens;
    }
  }

  // ── CONNECTION MANAGEMENT ──

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

  // ── SETTINGS PERSISTENCE ──

  @override
  Future<void> storeSettings(
      String ip, String username, String password, int port,
      {int? screenNumber}) async {
    _screenNumber = screenNumber ?? _screenNumber;
    await _storageDataSource.saveSettings(ConnectionEntity(
      ip: ip,
      username: username,
      password: password,
      port: port,
      screenNumber: _screenNumber,
    ));
  }

  @override
  Future<ConnectionEntity?> getSettings() async {
    return await _storageDataSource.loadSettings();
  }

  @override
  Future<void> startServer() async {
    // Open the firewall first so the controller can actually reach the server.
    await _openFirewallPort(GameServerConfig.port);

    try {
      // Run the script in the foreground so its stop/restart logic finishes before we verify (it backgrounds node itself); the default 5s command limit is too tight for a cold start and a premature retry would race the first run.
      await _execute(
          'cd ~/lg-rpg-server/scripts && mkdir -p ../logs && chmod +x start-server.sh && '
          'bash -l ./start-server.sh $screenNumber > ../logs/launch.log 2>&1',
          doneTimeout: const Duration(seconds: 15));
    } on TimeoutException {
      throw Exception('The LG did not respond while starting the server. '
          'Check logs/launch.log on the LG.');
    }

    // The script reports failures on a single "Error: ..." line; surface that real reason instead of polling a server that will never come up.
    final logTail =
        await _execute('tail -n 5 ~/lg-rpg-server/logs/launch.log') ?? '';
    final errorLines =
        logTail.split('\n').where((l) => l.trim().startsWith('Error:'));
    if (errorLines.isNotEmpty) {
      throw Exception('Server start failed — ${errorLines.first.trim()}');
    }

    await _waitForServerConfigured(screenNumber);
    log.i('LG server started with $screenNumber screen(s) on port '
        '${GameServerConfig.port}');
  }

  /// Polls `/api/config` until the running server reports [expectedScreens].
  Future<void> _waitForServerConfigured(
    int expectedScreens, {
    int attempts = 10,
    Duration interval = const Duration(seconds: 1),
  }) async {
    final url = 'http://localhost:${GameServerConfig.port}/api/config';
    int? seenScreens;
    for (int i = 0; i < attempts; i++) {
      final body = await _execute('curl -s --max-time 2 "$url" || true');
      if (body != null) {
        final match = RegExp(r'"totalScreens"\s*:\s*(\d+)').firstMatch(body);
        if (match != null) {
          seenScreens = int.tryParse(match.group(1)!);
          if (seenScreens == expectedScreens) {
            return;
          }
        }
      }
      await Future.delayed(interval);
    }
    // Distinguish "wrong screen count" from "server never responded".
    throw Exception(
      seenScreens != null
          ? 'Server is running with $seenScreens screen(s), expected '
              '$expectedScreens. Stop the server and start it again.'
          : 'Server did not respond on port ${GameServerConfig.port}. '
              'Check logs/launch.log on the LG.',
    );
  }

  Future<void> _openFirewallPort(int port) async {
    final accept = '-p tcp --dport $port -j ACCEPT';
    final sudo = 'echo "$_password" | sudo -S -p ""';

    // LG images differ: some run ufw, some only raw iptables. Do both.
    await _execute(
      '$sudo sh -c "command -v ufw >/dev/null 2>&1 && ufw allow $port/tcp" 2>&1 || true',
    );
    await _execute(
      '$sudo sh -c "iptables -C INPUT $accept 2>/dev/null || iptables -I INPUT 1 $accept" 2>&1 || true',
    );

    // Verify the port really opened instead of assuming success.
    final rules = await _execute('$sudo iptables -S INPUT 2>&1') ?? '';
    if (rules.contains('--dport $port')) {
      log.i('Firewall: port $port is open on the LG');
    } else {
      log.w('Firewall: could not confirm port $port is open (sudo said: '
          '"${rules.trim().split('\n').first}"). Continuing — port $port is '
          'normally whitelisted on the rig. If the phone cannot reach the '
          'server, run: sudo iptables -I INPUT 1 -p tcp --dport $port -j ACCEPT');
    }
  }

  @override
  Future<void> stopServer() async {
    await _execute(
        'cd ~/lg-rpg-server/scripts && mkdir -p ../logs && chmod +x stop-server.sh && nohup bash -l ./stop-server.sh $screenNumber > ../logs/stop.log 2>&1 &');
  }

  @override
  Future<void> launchBrowser() async {
    // Browsers must load the game from the same address the phones use; otherwise the script falls back to its hard-coded default IP.
    final settings = await _storageDataSource.loadSettings();
    final serverIp = settings?.ip.trim() ?? '';
    // The script can run 30s+ (past the 5s SSH cap) so it stays backgrounded; the log is truncated first so the poll below can't read a previous run's outcome, and IP/password are quoted so an empty IP cannot shift the password into the IP slot.
    await _execute(
        "cd ~/lg-rpg-server/scripts && mkdir -p ../logs && > ../logs/launch-browsers.log && chmod +x launch-browsers.sh && nohup bash -l ./launch-browsers.sh $screenNumber ${GameServerConfig.port} '$serverIp' '$_password' >> ../logs/launch-browsers.log 2>&1 &");
    await _waitForBrowserLaunch();
    log.i('LG browsers launched on $screenNumber screen(s)');
  }

  /// Polls the launch log until the script reports "Done." or an "Error:" line, so failures reach the UI instead of dying silently in a nohup log.
  Future<void> _waitForBrowserLaunch({
    int attempts = 45,
    Duration interval = const Duration(seconds: 1),
  }) async {
    const logPath = '~/lg-rpg-server/logs/launch-browsers.log';
    for (int i = 0; i < attempts; i++) {
      await Future.delayed(interval);
      final tail =
          await _execute('tail -n 40 $logPath 2>/dev/null || true') ?? '';
      final lines = tail.split('\n').map((l) => l.trim()).toList();
      final error = lines.firstWhere(
        (l) => l.startsWith('Error:'),
        orElse: () => '',
      );
      if (error.isNotEmpty) {
        throw Exception('Browser launch failed — $error');
      }
      if (lines.contains('Done.')) {
        // The script keeps going past unreachable slaves; those screens stay blank, so a partial launch is still a failure worth showing.
        final unreachable = lines.where((l) => l.startsWith('Could not SSH'));
        if (unreachable.isNotEmpty) {
          throw Exception(
              'Some screens did not open — ${unreachable.join(' ')}');
        }
        return;
      }
    }
    throw Exception('Browser launch did not finish within ${attempts}s. '
        'Check logs/launch-browsers.log on the LG.');
  }

  @override
  Future<void> closeBrowser() async {
    await _execute(
        "cd ~/lg-rpg-server/scripts && mkdir -p ../logs && chmod +x close-browsers.sh && nohup bash -l ./close-browsers.sh $screenNumber '$_password' > ../logs/close-browsers.log 2>&1 &");
  }

  @override
  Future<void> setScreenNumber(int screens) async {
    _screenNumber = screens;
    // Persist unconditionally: gating on a saved profile silently reset a 5-screen rig to the 3-screen default when the first-ever connect failed.
    await _storageDataSource.saveScreenNumber(screens);
  }

  @override
  Future<int?> getStoredScreenNumber() {
    return _storageDataSource.getScreenNumber();
  }

  // ── HELPER METHODS ──

  /// Executes a command over SSH, logging failures. Returns the stdout.
  Future<String?> _execute(String cmd, {Duration? doneTimeout}) async {
    try {
      return await _sshService.execute(cmd, doneTimeout: doneTimeout);
    } catch (e) {
      log.e('LG Command Error: $e');
      rethrow;
    }
  }

  /// Leftmost screen for logo placement (DATA Spaces pattern).
  int _calculateLeftMostScreen(int screens) {
    if (screens == 1) return 1;
    return (screens / 2).floor() + 2;
  }

  /// Password for sudo commands; empty string when not connected.
  String get _password => _sshService.password ?? '';

  /// Where Apache serves /var/www/html from, as Google Earth sees it.
  static const String _kmlUrlBase = 'http://lg1:81';

  static const String _emptyKml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Empty</name>
  </Document>
</kml>''';

  // ── NAVIGATION COMMANDS ──

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

  // ── KML OPERATIONS ──

  @override
  Future<void> uploadKml(String content, String fileName) async {
    await _sshService.uploadViaSftp(content, '/var/www/html/$fileName');
  }

  @override
  Future<void> sendKmlToSlave(String kmlContent, int screen) async {
    final safeKml = kmlContent.replaceAll("'", "\\'");
    await _execute("echo '$safeKml' > /var/www/html/kml/slave_$screen.kml");
  }

  @override
  Future<void> sendKml(String kmlContent, String name) async {
    // Use a unique filename each send, or the rig would never re-fetch the KML.
    final fileName = '${name}_${DateTime.now().millisecondsSinceEpoch}.kml';
    await uploadKml(kmlContent, fileName);
    await _execute('echo "$_kmlUrlBase/$fileName" > /var/www/html/kmls.txt');
  }

  @override
  Future<void> stopTour() async {
    await sendQuery('exittour=true');
  }

  @override
  Future<void> cleanAllKml() async {
    // Resolve the screen count first, or the blanking loop below can stop short of the rig's real width and strand a logo on a screen it never reaches.
    await _loadScreenNumber();

    // Stop any tour and empty the KML list. Deliberately does NOT touch master.kml — that's the anchor sync_nlc updates through.
    await _execute(
        'echo "exittour=true" > /tmp/query.txt && > /var/www/html/kmls.txt');

    // Blanking every slave clears the logo along with everything else.
    for (int i = 1; i <= _screenNumber; i++) {
      await _execute("echo '$_emptyKml' > /var/www/html/kml/slave_$i.kml");
    }
  }

  // ── VISUAL ELEMENTS ──

  /// ScreenOverlay pinning the logo to the top-left of its screen; split out so a clear can restore it without re-uploading the image.
  static const String _logoKml = '''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <ScreenOverlay>
    <name>Logo</name>
    <Icon><href>$_kmlUrlBase/lg_logo.png</href></Icon>
    <overlayXY x="0" y="1" xunits="fraction" yunits="fraction"/>
    <screenXY x="0" y="0.98" xunits="fraction" yunits="fraction"/>
    <rotationXY x="0" y="0" xunits="fraction" yunits="fraction"/>
    <size x="500" y="264" xunits="pixels" yunits="pixels"/>
  </ScreenOverlay>
</kml>''';

  @override
  Future<void> sendLogo({String assetPath = 'image/logo.png'}) async {
    // Resolve the screen count from storage first: the cached field is seeded by a fire-and-forget load in the constructor and could still be the default 3, dropping the logo on the wrong screen.
    await _loadScreenNumber();
    final leftMost = _calculateLeftMostScreen(_screenNumber);

    final ByteData data = await rootBundle.load('assets/$assetPath');
    final Uint8List bytes = data.buffer.asUint8List();
    await _sshService.uploadBytesViaSftp(bytes, '/var/www/html/lg_logo.png');
    await _execute('chmod 644 /var/www/html/lg_logo.png');

    // Point the leftmost screen's KML at the uploaded image.
    await sendKmlToSlave(_logoKml, leftMost);
  }

  @override
  Future<void> orbit(OrbitEntity orbitParams) async {
    // KML tour orbit — the approach every Liquid Galaxy controller app uses (Space Visualizations, AI Touristic Explorer, ...): upload one gx:Tour with a FlyTo per 10° and play it. Earth interpolates the whole path locally at render framerate, so smoothness no longer depends on Wi-Fi. The timestamped tour name gives a fresh file URL and playtour target on every press, which defeats the rig's KML-by-URL caching.
    await stopTour();
    await Future.delayed(const Duration(milliseconds: 100));

    final tourName = 'Orbit_${DateTime.now().millisecondsSinceEpoch}';
    final fileName = '$tourName.kml';
    await _execute('rm -f /var/www/html/Orbit_*.kml');
    await uploadKml(_buildOrbitTour(orbitParams, tourName), fileName);
    // Drop stale orbit entries but keep other KMLs (the area highlight) alive, then register the fresh tour for the rig's sync loop to pick up.
    await _execute('sed -i "/Orbit_/d" /var/www/html/kmls.txt 2>/dev/null; '
        'echo "$_kmlUrlBase/$fileName" >> /var/www/html/kmls.txt');
    // Give Earth a moment to fetch the tour before asking it to play it.
    await Future.delayed(const Duration(seconds: 2));
    await sendQuery('playtour=$tourName');
  }

  /// A tour can't loop, so several revolutions are baked in; Stop Orbit ends it early via exittour, and Clear KML sweeps the accumulated tour files.
  static const int _orbitRevolutions = 6;
  static const int _orbitDegreesPerStep = 10;

  String _buildOrbitTour(OrbitEntity p, String tourName) {
    final stepDuration = p.duration * _orbitDegreesPerStep / 360;
    final steps = StringBuffer();
    for (int rev = 0; rev < _orbitRevolutions; rev++) {
      for (int deg = 0; deg < 360; deg += _orbitDegreesPerStep) {
        final heading = (p.heading + deg) % 360;
        steps.write('<gx:FlyTo>'
            '<gx:duration>$stepDuration</gx:duration>'
            '<gx:flyToMode>smooth</gx:flyToMode>'
            '<LookAt>'
            '<longitude>${p.longitude}</longitude>'
            '<latitude>${p.latitude}</latitude>'
            '<altitude>${p.altitude}</altitude>'
            '<heading>$heading</heading>'
            '<tilt>${p.tilt}</tilt>'
            '<range>${p.range}</range>'
            '<gx:altitudeMode>relativeToGround</gx:altitudeMode>'
            '</LookAt>'
            '</gx:FlyTo>');
      }
    }
    return '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2" '
        'xmlns:gx="http://www.google.com/kml/ext/2.2">'
        '<gx:Tour><name>$tourName</name>'
        '<gx:Playlist>$steps</gx:Playlist>'
        '</gx:Tour></kml>';
  }

  // ── SYSTEM CONTROLS ──

  @override
  Future<bool> rebootAll() => _sudoOnAllMachines('reboot', 'Reboot');

  @override
  Future<bool> shutdownAll() => _sudoOnAllMachines('shutdown now', 'Shutdown');

  /// Runs a sudo command on every machine, slaves first (highest to lowest) so the master goes down last. Returns false if any machine failed.
  Future<bool> _sudoOnAllMachines(String command, String label) async {
    if (_password.isEmpty) {
      throw Exception(
          'No password available for ${label.toLowerCase()} command');
    }

    bool allSuccessful = true;
    for (int i = _screenNumber; i >= 1; i--) {
      try {
        await _execute(
            'sshpass -p $_password ssh -t lg$i "echo $_password | sudo -S $command"');
        if (i > 1) {
          await Future.delayed(const Duration(milliseconds: 200));
        }
      } catch (e) {
        log.e('$label lg$i failed: $e');
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

    // Restarts the display manager on the master; propagates to slaves.
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
  Future<void> setRefresh() => _patchAllSlavesRefresh(enable: true);

  @override
  Future<void> resetRefresh() => _patchAllSlavesRefresh(enable: false);

  Future<void> _patchAllSlavesRefresh({required bool enable}) async {
    if (_password.isEmpty) return;
    // Resolve the real screen count first: a stale cache stops the loop short and leaves the far slaves unpatched — including the one the logo lands on.
    await _loadScreenNumber();
    // lg1 is the master and reads its own myplaces; only slaves need patching.
    for (int i = 2; i <= _screenNumber; i++) {
      await _patchSlaveRefresh(i, enable: enable);
    }
  }

  /// Adds or removes the refresh tags on one slave's myplaces template.
  Future<void> _patchSlaveRefresh(int screen, {required bool enable}) async {
    const refreshTags = '<refreshMode>onInterval</refreshMode>'
        '<refreshInterval>2</refreshInterval>';
    final link = '<href>##LG_PHPIFACE##kml/slave_$screen.kml</href>';
    const template = '~/earth/kml/slave/myplaces.kml';

    // Always strip first (or running twice would stack duplicate refresh tags), and match any interval — a value left by another tool would survive an exact-match strip and get a second block appended.
    const anyRefreshTags = '<refreshMode>onInterval</refreshMode>'
        '<refreshInterval>[0-9]*</refreshInterval>';
    final strip = 'sed -i "s|$link$anyRefreshTags|$link|" $template';
    final add = 'sed -i "s|$link|$link$refreshTags|" $template';

    for (final cmd in enable ? [strip, add] : [strip]) {
      await _execute(
        'sshpass -p $_password ssh -t lg$screen '
        '\'echo $_password | sudo -S $cmd\'',
      );
    }
  }
}
