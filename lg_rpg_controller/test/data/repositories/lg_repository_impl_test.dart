import 'package:flutter_test/flutter_test.dart';
import 'package:lg_rpg_controller/data/datasources/local_storage_source.dart';
import 'package:lg_rpg_controller/data/repositories/lg_repository_impl.dart';
import 'package:lg_rpg_controller/domain/entities/connection_entity.dart';
import 'package:lg_rpg_controller/domain/entities/fly_to_entity.dart';
import 'package:lg_rpg_controller/domain/entities/orbit_entity.dart';
import 'package:lg_rpg_controller/domain/services/ssh_service_interface.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([ISshService, LocalStorageDataSource])
import 'lg_repository_impl_test.mocks.dart';

void main() {
  late LgRepositoryImpl repository;
  late MockISshService mockSshService;
  late MockLocalStorageDataSource mockStorage;

  setUp(() {
    mockSshService = MockISshService();
    mockStorage = MockLocalStorageDataSource();

    // Common stubs: constructor calls _loadScreenNumber
    when(mockStorage.loadSettings()).thenAnswer((_) async => null);
    when(mockStorage.getScreenNumber()).thenAnswer((_) async => 3);
    when(mockStorage.saveScreenNumber(any)).thenAnswer((_) async {});
    when(mockSshService.execute(any)).thenAnswer((_) async => 'OK');
    when(mockSshService.disconnect()).thenAnswer((_) async {});
    when(mockSshService.password).thenReturn('lg');

    repository = LgRepositoryImpl(mockSshService, mockStorage);
  });

  // CONNECTION MANAGEMENT

  group('Connection Management', () {
    test('should delegate connect call to SSH service', () async {
      when(mockSshService.connect(any, any, any, any)).thenAnswer((_) async {});

      await repository.connect('1.1.1.1', 'lg', 'lg', 22);

      // Note: Repository swaps username/password order for SSH service
      verify(mockSshService.connect('1.1.1.1', 'lg', 'lg', 22)).called(1);
    });

    test('should delegate disconnect call to SSH service', () async {
      await repository.disconnect();

      verify(mockSshService.disconnect()).called(1);
    });

    test('should expose isConnected from SSH service', () {
      when(mockSshService.isConnected).thenReturn(true);
      expect(repository.isConnected, true);

      when(mockSshService.isConnected).thenReturn(false);
      expect(repository.isConnected, false);
    });
  });

  // SETTINGS PERSISTENCE

  group('Settings Persistence', () {
    test('should save connection settings to local storage', () async {
      when(mockStorage.saveSettings(any)).thenAnswer((_) async {});

      await repository.storeSettings('1.1.1.1', 'lg', 'lg', 22,
          screenNumber: 5);

      verify(mockStorage.saveSettings(any)).called(1);
    });

    test('should return saved settings from local storage', () async {
      final savedEntity = ConnectionEntity(
        ip: '1.1.1.1',
        username: 'lg',
        password: 'lg',
        port: 22,
      );
      when(mockStorage.loadSettings()).thenAnswer((_) async => savedEntity);

      final result = await repository.getSettings();

      expect(result, isNotNull);
      expect(result!.ip, '1.1.1.1');
      expect(result.username, 'lg');
    });

    test('should return null when no settings are saved', () async {
      when(mockStorage.loadSettings()).thenAnswer((_) async => null);

      final result = await repository.getSettings();

      expect(result, isNull);
    });

    test('should update screen number and persist it', () async {
      await repository.setScreenNumber(5);

      expect(repository.screenNumber, 5);
      // Persists to the standalone key even with no saved profile, so the choice survives a failed first connect.
      verify(mockStorage.saveScreenNumber(5)).called(1);
    });
  });

  // NAVIGATION COMMANDS

  group('Navigation Commands', () {
    test('should build correct LookAt KML and send via query', () async {
      final flyToData = FlyToEntity(
        latitude: 28.6139,
        longitude: 77.2090,
        altitude: 0,
        range: 5000,
        tilt: 60,
        heading: 90,
      );

      await repository.flyTo(flyToData);

      verify(mockSshService.execute(argThat(allOf(
        contains('echo "flytoview=<LookAt>'),
        contains('<longitude>77.209</longitude>'),
        contains('<latitude>28.6139</latitude>'),
        contains('<range>5000.0</range>'),
        contains('<tilt>60.0</tilt>'),
      )))).called(1);
    });

    test('should write query string to /tmp/query.txt', () async {
      await repository.sendQuery('playtour=MyTour');

      verify(mockSshService.execute('echo "playtour=MyTour" > /tmp/query.txt'))
          .called(1);
    });
  });

  // KML OPERATIONS

  group('KML Operations', () {
    test('should upload KML content via SFTP to correct path', () async {
      when(mockSshService.uploadViaSftp(any, any)).thenAnswer((_) async {});

      await repository.uploadKml('<kml>test</kml>', 'tour.kml');

      verify(mockSshService.uploadViaSftp(
              '<kml>test</kml>', '/var/www/html/tour.kml'))
          .called(1);
    });

    test('should send KML content to a specific slave screen', () async {
      await repository.sendKmlToSlave('<kml>slave</kml>', 2);

      verify(mockSshService.execute(argThat(
        contains('> /var/www/html/kml/slave_2.kml'),
      ))).called(1);
    });

    test('should publish KML by uploading it and pointing kmls.txt at it',
        () async {
      when(mockSshService.uploadViaSftp(any, any)).thenAnswer((_) async {});

      await repository.sendKml('<kml>area</kml>', 'area');

      // Standard LG pattern: SFTP the file, then list its URL in kmls.txt, which the rig's sync_nlc.php poller picks up live.
      verify(mockSshService.uploadViaSftp(
        '<kml>area</kml>',
        argThat(allOf(startsWith('/var/www/html/area_'), endsWith('.kml'))),
      )).called(1);
      verify(mockSshService.execute(argThat(allOf(
        contains('http://lg1:81/area_'),
        contains('> /var/www/html/kmls.txt'),
      )))).called(1);
    });

    test('should never write master.kml, the sync_nlc anchor', () async {
      when(mockSshService.uploadViaSftp(any, any)).thenAnswer((_) async {});

      await repository.sendKml('<kml>area</kml>', 'area');
      await repository.cleanAllKml();

      // master.kml holds the empty <Document id="master"> that sync_nlc's <Update> targets. Overwriting it silently kills every live update until Google Earth restarts — the original "only works after reboot" bug.
      verifyNever(mockSshService.execute(argThat(contains('master.kml'))));
      verifyNever(
          mockSshService.uploadViaSftp(any, argThat(contains('master.kml'))));
    });

    test('should give each KML a unique URL so Earth re-fetches it', () async {
      when(mockSshService.uploadViaSftp(any, any)).thenAnswer((_) async {});
      final paths = <String>[];
      when(mockSshService.uploadViaSftp(any, any)).thenAnswer((inv) async {
        paths.add(inv.positionalArguments[1] as String);
      });

      await repository.sendKml('<kml>a</kml>', 'area');
      await Future.delayed(const Duration(milliseconds: 2));
      await repository.sendKml('<kml>b</kml>', 'area');

      // The NetworkLink sync_nlc creates has no refresh of its own, so reusing a URL would never re-fetch; a new URL forces a Delete + Create.
      expect(paths.length, 2);
      expect(paths[0], isNot(equals(paths[1])));
    });

    test('should clean by emptying kmls.txt and stopping the tour', () async {
      // Default screen number is 3 (from setUp)
      await repository.cleanAllKml();

      verify(mockSshService.execute(argThat(allOf(
        contains('exittour=true'),
        contains('> /var/www/html/kmls.txt'),
      )))).called(1);

      // Slave screens carry their own per-screen KML (e.g. the logo).
      for (final screen in [1, 2, 3]) {
        verify(mockSshService.execute(argThat(
          contains('slave_$screen.kml'),
        ))).called(1);
      }
    });

    test('should wipe the logo along with everything else', () async {
      await repository.cleanAllKml();

      // Clear means clear: blanking every slave takes the logo off the leftmost screen (floor(3/2)+2 = 3) and nothing puts it back.
      verifyNever(mockSshService.execute(argThat(contains('<ScreenOverlay>'))));
    });

    test('should orbit by uploading a gx:Tour and playing it', () async {
      when(mockSshService.uploadViaSftp(any, any)).thenAnswer((_) async {});

      await repository.orbit(const OrbitEntity(
        latitude: 41.6,
        longitude: 0.62,
        duration: 1,
      ));

      // The canonical LG orbit: one gx:Tour uploaded once, played by name — Earth animates the whole path locally, no per-step SSH traffic.
      verify(mockSshService.uploadViaSftp(
        argThat(allOf(
          contains('<gx:Tour>'),
          contains('<gx:FlyTo>'),
          contains('<latitude>41.6</latitude>'),
        )),
        argThat(allOf(
          startsWith('/var/www/html/Orbit_'),
          endsWith('.kml'),
        )),
      )).called(1);
      verify(mockSshService.execute(argThat(allOf(
        contains('playtour=Orbit_'),
        contains('/tmp/query.txt'),
      )))).called(1);
      // The tour must be registered in kmls.txt without wiping other KMLs.
      verify(mockSshService.execute(argThat(allOf(
        contains('>> /var/www/html/kmls.txt'),
        contains('Orbit_'),
      )))).called(1);
    });

    test('should stop the orbit tour via exittour', () async {
      await repository.stopTour();

      verify(mockSshService.execute(argThat(allOf(
        contains('exittour=true'),
        contains('/tmp/query.txt'),
      )))).called(1);
    });
  });

  // SYSTEM CONTROLS

  group('System Controls', () {
    test('should send reboot command to all screens in reverse order',
        () async {
      final result = await repository.rebootAll();

      expect(result, true);
      // 3 screens: lg3, lg2, lg1 (reverse order)
      verify(mockSshService.execute(argThat(contains('lg3')))).called(1);
      verify(mockSshService.execute(argThat(contains('lg2')))).called(1);
      verify(mockSshService.execute(argThat(contains('lg1')))).called(1);
    });

    test('should throw exception when rebooting without password', () async {
      when(mockSshService.password).thenReturn(null);

      expectLater(repository.rebootAll(), throwsException);
    });

    test('should return false if any screen fails to reboot', () async {
      // Make lg2 fail
      when(mockSshService.execute(argThat(contains('lg2'))))
          .thenThrow(Exception('SSH timeout'));

      final result = await repository.rebootAll();

      expect(result, false);
    });

    test('should send shutdown command to all screens', () async {
      final result = await repository.shutdownAll();

      expect(result, true);
      verify(mockSshService.execute(argThat(contains('shutdown now'))))
          .called(3);
    });

    test('should throw exception when shutting down without password',
        () async {
      when(mockSshService.password).thenReturn(null);

      expectLater(repository.shutdownAll(), throwsException);
    });

    test('should send relaunch command to restart display manager', () async {
      await repository.relaunch();

      verify(mockSshService.execute(argThat(allOf(
        contains('RELAUNCH_CMD'),
        contains('sshpass'),
      )))).called(1);
    });

    test('should throw exception when relaunching without password', () async {
      when(mockSshService.password).thenReturn(null);

      expectLater(repository.relaunch(), throwsException);
    });

    // The template line each sed must match, and the two substitutions.
    const tags = '<refreshMode>onInterval</refreshMode>'
        '<refreshInterval>2</refreshInterval>';
    // The strip matches any interval, so a link left on a different value is still removed instead of getting a second block appended beside it.
    const anyTags = '<refreshMode>onInterval</refreshMode>'
        '<refreshInterval>[0-9]*</refreshInterval>';
    String link(int s) => '<href>##LG_PHPIFACE##kml/slave_$s.kml</href>';
    String addSed(int s) => 's|${link(s)}|${link(s)}$tags|';
    String stripSed(int s) => 's|${link(s)}$anyTags|${link(s)}|';

    test('should add refresh tags to every slave screen', () async {
      // Default screen number is 3 (from setUp) -> slaves are lg2 and lg3.
      await repository.setRefresh();

      for (final screen in [2, 3]) {
        verify(mockSshService.execute(argThat(allOf(
          contains('lg$screen'),
          contains(addSed(screen)),
          contains('~/earth/kml/slave/myplaces.kml'),
        )))).called(1);
      }
    });

    test('should not escape slashes, which made the old sed match nothing',
        () async {
      await repository.setRefresh();

      // The template holds a literal <href>##LG_PHPIFACE##kml/slave_2.kml</href>. The sed uses s|...|...|, so slashes need no escaping; the old code's "kml\\/slave_2.kml</\\/href>" matched no line in the file at all.
      verifyNever(mockSshService.execute(argThat(contains(r'\/'))));
    });

    test('should leave the master screen alone', () async {
      await repository.setRefresh();

      // lg1 reads its own myplaces; only slaves are patched.
      verifyNever(mockSshService.execute(argThat(contains('ssh -t lg1'))));
    });

    test('should strip before adding so tags cannot stack', () async {
      final commands = <String>[];
      when(mockSshService.execute(any)).thenAnswer((inv) async {
        commands.add(inv.positionalArguments[0] as String);
        return null;
      });

      await repository.setRefresh();

      // Per slave: strip, then add. Running twice must not double the tags.
      final lg2 = commands.where((c) => c.contains('lg2')).toList();
      expect(lg2.length, 2);
      expect(lg2.first, contains(stripSed(2)));
      expect(lg2.last, contains(addSed(2)));
    });

    test('should strip a refresh interval it did not write', () async {
      await repository.setRefresh();

      // Another tool, or an older build, may have left a different interval on the link. An exact-match strip would miss it and the add would append a second block, leaving two refresh pairs inside one <Link>.
      verify(mockSshService.execute(argThat(contains(
        '<refreshInterval>[0-9]*</refreshInterval>',
      )))).called(greaterThan(0));
      verifyNever(mockSshService.execute(argThat(
        contains('s|${link(2)}<refreshMode>onInterval</refreshMode>'
            '<refreshInterval>2</refreshInterval>|'),
      )));
    });

    test('should only strip tags on reset', () async {
      await repository.resetRefresh();

      // One command per slave, and it must never re-add the tags.
      verify(mockSshService.execute(argThat(contains(stripSed(2))))).called(1);
      verify(mockSshService.execute(argThat(contains(stripSed(3))))).called(1);
      verifyNever(mockSshService.execute(argThat(contains(addSed(2)))));
    });

    test('should skip refresh changes when password is empty', () async {
      when(mockSshService.password).thenReturn('');

      await repository.setRefresh();
      await repository.resetRefresh();

      verifyNever(mockSshService.execute(argThat(contains('sshpass'))));
    });
  });
}
