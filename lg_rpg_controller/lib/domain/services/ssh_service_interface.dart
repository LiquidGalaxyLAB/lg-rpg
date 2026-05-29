import 'dart:typed_data';

/// Abstract interface for SSH service operations.

abstract class ISshService {
  /// Returns true if the SSH client is connected and healthy.
  bool get isConnected;

  /// Exposes the password for system commands (relaunch, reboot, etc.)
  String? get password;

  /// Exposes the username for system commands
  String? get username;

  /// Callback for when connection is lost
  void Function()? get onConnectionLost;
  set onConnectionLost(void Function()? callback);

  /// Connect to SSH server
  Future<void> connect(String ip, String password, String user, int port);

  /// Disconnect from SSH server
  Future<void> disconnect();

  /// Execute a command on the remote server
  Future<String?> execute(String cmd);

  /// Upload content to remote path via SFTP
  Future<void> uploadViaSftp(String content, String remotePath);

  /// Upload binary data (e.g., images) to remote path via SFTP
  Future<void> uploadBytesViaSftp(Uint8List bytes, String remotePath);

  /// Dispose method to clean up resources
  void dispose();
}
