import 'package:flutter_test/flutter_test.dart';
import 'package:lg_rpg_controller/domain/repositories/lg_repository.dart';
import 'package:lg_rpg_controller/domain/usecases/system_control.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([LGRepository])
import 'system_control_test.mocks.dart';

void main() {
  late MockLGRepository mockRepository;

  setUp(() {
    mockRepository = MockLGRepository();
  });

  group('RebootLgUseCase', () {
    test('should delegate reboot to LGRepository and return result', () async {
      when(mockRepository.setRefresh()).thenAnswer((_) async {});
      when(mockRepository.rebootAll()).thenAnswer((_) async => true);

      final useCase = RebootLgUseCase(mockRepository);
      final result = await useCase.call();

      expect(result, true);
      verify(mockRepository.rebootAll()).called(1);
    });

    test('should set the slave refresh before rebooting', () async {
      when(mockRepository.setRefresh()).thenAnswer((_) async {});
      when(mockRepository.rebootAll()).thenAnswer((_) async => true);

      await RebootLgUseCase(mockRepository).call();

      // The patch only takes effect on the next Earth start, so it has to land before the reboot or the logo stays invisible for another whole cycle.
      verifyInOrder([
        mockRepository.setRefresh(),
        mockRepository.rebootAll(),
      ]);
    });
  });

  group('ShutdownLgUseCase', () {
    test('should delegate shutdown to LGRepository and return result',
        () async {
      when(mockRepository.shutdownAll()).thenAnswer((_) async => true);

      final useCase = ShutdownLgUseCase(mockRepository);
      final result = await useCase.call();

      expect(result, true);
      verify(mockRepository.shutdownAll()).called(1);
    });
  });

  group('RelaunchLgUseCase', () {
    test('should delegate relaunch to LGRepository', () async {
      when(mockRepository.relaunch()).thenAnswer((_) async {});

      final useCase = RelaunchLgUseCase(mockRepository);
      await useCase.call();

      verify(mockRepository.relaunch()).called(1);
    });
  });

  group('CleanAllKmlUseCase', () {
    test('should delegate clean all KML to LGRepository', () async {
      when(mockRepository.cleanAllKml()).thenAnswer((_) async {});

      final useCase = CleanAllKmlUseCase(mockRepository);
      await useCase.call();

      verify(mockRepository.cleanAllKml()).called(1);
    });
  });

  group('SendLogoUseCase', () {
    test('should delegate send logo to LGRepository', () async {
      when(mockRepository.sendLogo()).thenAnswer((_) async {});

      final useCase = SendLogoUseCase(mockRepository);
      await useCase.call();

      verify(mockRepository.sendLogo()).called(1);
    });
  });
}
