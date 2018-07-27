
export const BluenetErrorType = {
  INPUT_ERROR: 'INPUT_ERROR',
  COULD_NOT_VALIDATE_SESSION_NONCE: 'COULD_NOT_VALIDATE_SESSION_NONCE',
  INCOMPATIBLE_FIRMWARE: 'INCOMPATIBLE_FIRMWARE',
  NO_ENCRYPTION_KEYS: 'NO_ENCRYPTION_KEYS',
  ALREADY_CONNECTING_TO_SOMETHING_ELSE: 'ALREADY_CONNECTING_TO_SOMETHING_ELSE',
  ALREADY_CONNECTED_TO_SOMETHING_ELSE: 'ALREADY_CONNECTED_TO_SOMETHING_ELSE',
  INVALID_PERIPHERAL: 'INVALID_PERIPHERAL',
}

export class BluenetError {
  type: string
  message: string
  code: number

  constructor(type, message, code = 500) {
    this.type = type;
    this.message = message;
    this.code = code;
  }
}