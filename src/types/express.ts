export interface TargetInfo {
  valid: boolean;
  key: string | undefined;
  url: string | undefined;
  test: boolean;
}

declare global {
  namespace Express {
    interface Request {
      target?: TargetInfo;
    }
  }
}
