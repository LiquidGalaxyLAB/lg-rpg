import 'package:flutter_test/flutter_test.dart';
import 'package:lg_rpg_controller/data/datasources/local_storage_source.dart';
import 'package:lg_rpg_controller/data/repositories/lg_repository_impl.dart';
import 'package:lg_rpg_controller/domain/entities/connection_entity.dart';
import 'package:lg_rpg_controller/domain/entities/fly_to_entity.dart';
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
    when(mockSshService.execute(any)).thenAnswer((_) async => 'OK');
    when(mockSshService.disconnect()).thenAnswer((_) async {});
    when(mockSshService.password).thenReturn('lg');

    repository = LgRepositoryImpl(mockSshService, mockStorage);
  });

  // ─────────────────────────────────────────────────────────────
  // CONNECTION MANAGEMENT
  // ─────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────
  // SETTINGS PERSISTENCE
  // ─────────────────────────────────────────────────────────────

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
      final existing = ConnectionEntity(
        ip: '1.1.1.1',
        username: 'lg',
        password: 'lg',
        port: 22,
        screenNumber: 3,
      );
      when(mockStorage.loadSettings()).thenAnswer((_) async => existing);
      when(mockStorage.saveSettings(any)).thenAnswer((_) async {});

      await repository.setScreenNumber(5);

      expect(repository.screenNumber, 5);
      verify(mockStorage.saveSettings(any)).called(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // NAVIGATION COMMANDS
  // ─────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────
  // KML OPERATIONS
  // ─────────────────────────────────────────────────────────────

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

    test('should send KML content to master.kml', () async {
      await repository.sendKmlToMaster('<kml>master</kml>');

      // sendKmlToMaster creates the kml directory first, then writes
      verify(mockSshService.execute('mkdir -p /var/www/html/kml')).called(1);
      verify(mockSshService.execute(argThat(
        contains('> /var/www/html/kml/master.kml'),
      ))).called(1);
    });

    test('should clean all KML files across all screens', () async {
      // Default screen number is 3 (from setUp)
      await repository.cleanAllKml();

      // Should clear master.kml
      verify(mockSshService.execute(argThat(
        contains('> /var/www/html/kml/master.kml'),
      ))).called(1);

      // Should clear query.txt
      verify(mockSshService.execute(argThat(
        contains('> /tmp/query.txt'),
      ))).called(1);

      // Should clear all 3 slave screens
      verify(mockSshService.execute(argThat(
        contains('slave_1.kml'),
      ))).called(1);
      verify(mockSshService.execute(argThat(
        contains('slave_2.kml'),
      ))).called(1);
      verify(mockSshService.execute(argThat(
        contains('slave_3.kml'),
      ))).called(1);
    });

    test('should clear only the navigation query file', () async {
      await repository.clearNavigation();

      verify(mockSshService.execute('echo "" > /tmp/query.txt')).called(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // VISUAL ELEMENTS
  // ─────────────────────────────────────────────────────────────

  group('Visual Elements', () {
    test('should clean logo by sending empty KML to leftmost screen', () async {
      await repository.cleanLogo();

      // Default 3 screens → leftmost = floor(3/2) + 2 = 3
      verify(mockSshService.execute(argThat(allOf(
        contains('<name>Empty</name>'),
        contains('> /var/www/html/kml/slave_3.kml'),
      )))).called(1);
    });

    test('should send HTML overlay to rightmost screen', () async {
      await repository.sendHtmlOverlay('<h1>Hello LG</h1>');

      // Default 3 screens → rightmost = floor(3/2) + 1 = 2
      verify(mockSshService.execute(argThat(allOf(
        contains('<h1>Hello LG</h1>'),
        contains('> /var/www/html/kml/slave_2.kml'),
      )))).called(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // SYSTEM CONTROLS
  // ─────────────────────────────────────────────────────────────

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

    test('should send sed commands for force refresh on a screen', () async {
      await repository.forceRefresh(2);

      // Should execute 2 SSH commands (set refresh + remove refresh)
      verify(mockSshService.execute(argThat(allOf(
        contains('sshpass'),
        contains('lg2'),
        contains('sed'),
      )))).called(2);
    });

    test('should skip force refresh when password is empty', () async {
      when(mockSshService.password).thenReturn('');

      await repository.forceRefresh(2);

      // Should not call execute at all (returns early)
      verifyNever(mockSshService.execute(argThat(contains('sshpass'))));
    });
  });
}
