abstract class ISocketService {
  bool get isConnected;
  Stream<bool> get connectionStream;
  Future<void> connect(String url);
  Future<void> disconnect();
  void emit(String event, dynamic data);
  void on(String event, Function(dynamic) callback);
  void off(String event);
}
