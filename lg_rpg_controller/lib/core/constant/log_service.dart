import 'package:logger/logger.dart';

class LogService {
  static final LogService _instance = LogService._internal();

  factory LogService() => _instance;
  LogService._internal();

  final Logger _logger = Logger(
    printer: PrettyPrinter(
      methodCount: 2, // Number of method calls to show
      errorMethodCount: 8, // Stacktrace lines for errors
      lineLength: 80, // Width of output
      colors: true, // Colorful logs
      printEmojis: true, // Emojis for log levels
      dateTimeFormat: DateTimeFormat.onlyTimeAndSinceStart, // Timestamp
    ),
  );

  // Public logging methods
  void d(String message) => _logger.d(message);
  void i(String message) => _logger.i(message);
  void w(String message) => _logger.w(message);
  void e(String message, [dynamic error, StackTrace? stackTrace]) =>
      _logger.e(message, error: error, stackTrace: stackTrace);
}
