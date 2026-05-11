export interface ApiError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  errors: ApiError[];
  statusCode: number;
  timestamp: string;
}
