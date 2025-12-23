export type SensorSnapshot = {
  capturedAtIso: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
  };
};

export type DescribeRequest = {
  // Policy hint for latency/precision trade-off.
  mode?: 'balanced' | 'accurate' | 'fast';
  // base64 image, without data: prefix (server-dependent)
  imageBase64?: string;
  imageMimeType?: string;
  // base64 audio, without data: prefix (server-dependent)
  audioBase64?: string;
  prompt?: string;
  sensors: SensorSnapshot;
};

export type DescribeResponse = {
  description: string;
  confidence?: number;
  // optionally, model metadata for research traceability
  model?: {
    name: string;
    version?: string;
  };
};
