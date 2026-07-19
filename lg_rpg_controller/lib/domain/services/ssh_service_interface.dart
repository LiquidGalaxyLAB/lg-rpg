import 'dart:typed_data';

/// SSH operations against the Liquid Galaxy master.
abstract class ISshService {
  /// True if the SSH client is connected and healthy.
  bool get isConnected;

  /// Password for system commands (relaunch, reboot, etc.).
  String? get password;

  /// Username for system commands.
  String? get username;

  /// Called when the connection is lost.
  void Function()? get onConnectionLost;
  set onConnectionLost(void Function()? callback);

  Future<void> connect(String ip, String password, String user, int port);

  Future<void> disconnect();

  /// Executes a command remotely; [doneTimeout] overrides the default per-command limit for known-slow commands (e.g. server start).
  Future<String?> execute(String cmd, {Duration? doneTimeout});

  /// Uploads text to a remote path via SFTP.
  Future<void> uploadViaSftp(String content, String remotePath);

  /// Uploads binary data (e.g. images) to a remote path via SFTP.
  Future<void> uploadBytesViaSftp(Uint8List bytes, String remotePath);

  void dispose();
}
