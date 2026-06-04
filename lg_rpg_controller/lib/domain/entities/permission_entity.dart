import 'package:equatable/equatable.dart';

class PermissionEntity extends Equatable {
  final bool isLocationGranted;
  final bool isRequesting;

  const PermissionEntity({
    this.isLocationGranted = false,
    this.isRequesting = false,
  });

  PermissionEntity copyWith({
    bool? isLocationGranted,
    bool? isRequesting,
  }) {
    return PermissionEntity(
      isLocationGranted: isLocationGranted ?? this.isLocationGranted,
      isRequesting: isRequesting ?? this.isRequesting,
    );
  }

  @override
  List<Object?> get props => [isLocationGranted, isRequesting];
}
