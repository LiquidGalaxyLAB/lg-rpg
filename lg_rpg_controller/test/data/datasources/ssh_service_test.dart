import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:lg_rpg_controller/domain/services/ssh_service_interface.dart';

@GenerateMocks([ISshService])
import 'ssh_service_test.mocks.dart';

void main() {
  group('SshService Tests', () {
    late MockISshService mockSshService;

    setUp(() {
      mockSshService = MockISshService();
    });

    group('isConnected test Cases', () {
      test('should return true when connected', () {
        // Arrange
        when(mockSshService.isConnected).thenReturn(true);

        // Act
        final result = mockSshService.isConnected;

        // Assert
        expect(result, true);
        verify(mockSshService.isConnected).called(1);
      });

      test('should return false when not connected', () {
        // Arrange
        when(mockSshService.isConnected).thenReturn(false);

        // Act
        final result = mockSshService.isConnected;

        // Assert
        expect(result, false);
      });
    });

    group('connect method test cases', () {
      test('should call connect with correct parameters', () async {
        // Arrange
        const ip = '192.168.1.100';
        const username = 'lg';
        const password = 'lg';
        const port = 22;

        when(mockSshService.connect(ip, password, username, port))
            .thenAnswer((_) async => Future.value());

        // Act
        await mockSshService.connect(ip, password, username, port);

        // Assert
        verify(mockSshService.connect(ip, password, username, port)).called(1);
      });

      test('should throw exception when connect fails', () async {
        // Arrange
        when(mockSshService.connect(any, any, any, any))
            .thenThrow(Exception('Connection failed'));

        // Act & Assert
        expect(
          () => mockSshService.connect('invalid', 'pass', 'user', 22),
          throwsException,
        );
      });
    });

    group('execute test cases ', () {
      test('should execute command successfully', () async {
        // Arrange
        const command = 'echo "test"';
        when(mockSshService.execute(command)).thenAnswer((_) async => 'OK');

        // Act
        final result = await mockSshService.execute(command);

        // Assert
        expect(result, 'OK');
        verify(mockSshService.execute(command)).called(1);
      });

      test('should throw exception if command fails', () async {
        // Arrange
        const command = 'ls';
        when(mockSshService.execute(command))
            .thenThrow(Exception('SSH Command failed'));

        // Act & Assert
        expect(
          () => mockSshService.execute(command),
          throwsException,
        );
        verify(mockSshService.execute(command)).called(1);
      });
    });

    group('uploadViaSftp test cases', () {
      test('should upload file via SFTP', () async {
        // Arrange
        const content = '<?xml version="1.0"?><kml></kml>';
        const remotePath = '/var/www/html/test.kml';

        when(mockSshService.uploadViaSftp(content, remotePath))
            .thenAnswer((_) async => Future.value());

        // Act
        await mockSshService.uploadViaSftp(content, remotePath);

        // Assert
        verify(mockSshService.uploadViaSftp(content, remotePath)).called(1);
      });
      test('should throw exception whe file via SFTP fail', () async {
        // Arrange
        const content = '<?xml version="1.0"?><kml></kml>';
        const remotePath = '/var/www/html/test.kml';

        when(mockSshService.uploadViaSftp(content, remotePath))
            .thenThrow(Exception('Fail to upload file'));

        // Act
        expect(() => mockSshService.uploadViaSftp(content, remotePath),
            throwsException);

        // Assert
        verify(mockSshService.uploadViaSftp(content, remotePath)).called(1);
      });
    });

    test('should call onConnectionLost callback when connection is lost', () {
      // Arrange
      bool callbackCalled = false;
      bool myCallback() => callbackCalled = true;

      when(mockSshService.onConnectionLost).thenReturn(myCallback);
      // Act
      mockSshService.onConnectionLost?.call();

      // Assert
      expect(callbackCalled, true);
    });

    test('should disconnect and clear credentials', () async {
      // Arrange
      when(mockSshService.disconnect()).thenAnswer((_) async => Future.value());
      when(mockSshService.isConnected).thenReturn(false);

      // Act
      await mockSshService.disconnect();

      // Assert
      verify(mockSshService.disconnect()).called(1);
      expect(mockSshService.isConnected, false);
    });

    test('should dispose resources properly', () {
      // Arrange
      when(mockSshService.dispose()).thenReturn(null);

      // Act
      mockSshService.dispose();

      // Assert
      verify(mockSshService.dispose()).called(1);
    });
  });
}
