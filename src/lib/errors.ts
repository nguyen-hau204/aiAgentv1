export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export class ValidationAppError extends AppError {
  constructor(message = "Dữ liệu đầu vào không hợp lệ.") {
    super(message, "VALIDATION_ERROR", 422);
  }
}

export class ConfigurationError extends AppError {
  constructor(message = "Thiếu cấu hình hệ thống.") {
    super(message, "CONFIGURATION_ERROR", 500);
  }
}

export class GenerationError extends AppError {
  constructor(message = "Không thể tạo bài thuyết trình.") {
    super(message, "GENERATION_ERROR", 502);
  }
}
