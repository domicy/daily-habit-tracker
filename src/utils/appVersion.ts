import DeviceInfo from 'react-native-device-info';

export function getAppReleaseString(): string {
  return `${DeviceInfo.getVersion()}-r${DeviceInfo.getBuildNumber()}`;
}
