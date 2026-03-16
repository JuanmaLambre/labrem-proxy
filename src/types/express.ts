export interface TargetInfo {
  valid: boolean;
  key: string | undefined;
  url: string | undefined;
}

declare global {
  namespace Express {
    interface Request {
      targetServer?: TargetInfo;
    }
  }
}
