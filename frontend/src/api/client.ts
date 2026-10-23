type ErrorBody = {
  error?: {
    code?: unknown
    message?: unknown
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function errorFromBody(status: number, body: unknown): ApiError {
  const error = body && typeof body === 'object' ? (body as ErrorBody).error : undefined
  const code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message
    : `请求失败（${status}），请稍后重试`

  if (status >= 500) {
    return new ApiError('服务器暂时不可用，请稍后重试', status, code)
  }

  return new ApiError(message, status, code)
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError('无法连接服务器，请检查网络或稍后重试', 0, 'NETWORK_ERROR')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    if (!response.ok) throw errorFromBody(response.status, null)
    throw new ApiError('服务器返回了无效数据，请稍后重试', response.status, 'INVALID_RESPONSE')
  }

  if (!response.ok) throw errorFromBody(response.status, body)
  if (body === null || body === undefined) {
    throw new ApiError('服务器返回了无效数据，请稍后重试', response.status, 'INVALID_RESPONSE')
  }

  return body as T
}
