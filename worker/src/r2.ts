/** Minimal R2 surface this Worker uses. No S3 client. */

export type R2Conditional = {
  etagMatches?: string;
  etagDoesNotMatch?: string;
};

export type R2PutOptions = {
  onlyIf?: R2Conditional;
  customMetadata?: Record<string, string>;
};

export type R2Object = {
  key: string;
  etag: string;
  httpEtag: string;
  size: number;
  customMetadata: Record<string, string>;
};

export type R2ObjectBody = R2Object & {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type R2Bucket = {
  head(key: string): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer, options?: R2PutOptions): Promise<R2Object | null>;
};

export type Env = {
  VAULTS: R2Bucket;
};
