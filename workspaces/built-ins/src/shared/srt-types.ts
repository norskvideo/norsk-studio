import type { SrtOutputSettings as SdkSettings } from '@norskvideo/norsk-sdk';

export type SocketOptions = Pick<SdkSettings, 'peerLatency' | 'receiveLatency' | 'inputBandwidth' | 'overheadBandwidth' | 'maxBandwidth'>;
