import 'package:flutter_test/flutter_test.dart';
import 'package:lg_rpg_controller/domain/repositories/lg_repository.dart';
import 'package:lg_rpg_controller/domain/usecases/connect_to_lg.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([LGRepository])
import 'connect_to_lg_test.mocks.dart';

void main() {
  late MockLGRepository mockRepository;

  setUp(() {
    mockRepository = MockLGRepository();
  });

  group('ConnectToLgUseCase', () {
    test('should delegate connection to LGRepository', () async {
      when(mockRepository.connect(any, any, any, any)).thenAnswer((_) async {});

      final useCase = ConnectToLgUseCase(mockRepository);
      await useCase.call('1.1.1.1', 'lg', 'lg', 22);

      verify(mockRepository.connect('1.1.1.1', 'lg', 'lg', 22)).called(1);
    });
  });

  group('DisconnectFromLgUseCase', () {
    test('should delegate disconnection to LGRepository', () async {
      when(mockRepository.disconnect()).thenAnswer((_) async {});

      final useCase = DisconnectFromLgUseCase(mockRepository);
      await useCase.call();

      verify(mockRepository.disconnect()).called(1);
    });
  });

  group('FlyToLocationUseCase', () {
    test(
        'should create FlyToEntity with given coordinates and delegate to repository',
        () async {
      when(mockRepository.flyTo(any)).thenAnswer((_) async {});

      final useCase = FlyToLocationUseCase(mockRepository);
      await useCase.call(28.6139, 77.2090);

      // Capture the FlyToEntity that was passed to the repository
      final captured = verify(mockRepository.flyTo(captureAny)).captured.single;
      expect(captured.latitude, 28.6139);
      expect(captured.longitude, 77.2090);
      expect(captured.range, 1000);
      expect(captured.tilt, 45);
    });
  });
}
