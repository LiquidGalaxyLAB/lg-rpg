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
}
