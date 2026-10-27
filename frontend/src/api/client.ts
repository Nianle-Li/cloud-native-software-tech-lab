type ErrorBody = {
  error?: {
    code?: unknown
    message?: unknown
  }
  details?: unknown
}

const fieldLabels: Record<string, string> = {
  venue_id: '场地',
  booked_by: '预约人或组织',
  reservation_date: '预约日期',
  start_time: '开始时间',
  end_time: '结束时间',
  attendee_count: '参与人数',
  purpose: '使用目的',
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
  const response = body && typeof body === 'object' && !Array.isArray(body) ? body as ErrorBody : undefined
  const error = response?.error
  const code = typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message
    : `请求失败（${status}），请稍后重试`

  if (status >= 500) {
    return new ApiError('服务器暂时不可用，请稍后重试', status, code)
  }

  const detailMessages = code === 'VALIDATION_ERROR' && Array.isArray(response?.details)
    ? response.details.flatMap((detail: unknown) => {
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return []
      const { field, reason } = detail as Record<string, unknown>
      if (typeof field !== 'string' || typeof reason !== 'string' || !fieldLabels[field] || !reason.trim()) return []
      return [`${fieldLabels[field]}：${reason.trim().slice(0, 200)}`]
    }).slice(0, 3)
    : []
  return new ApiError(detailMessages.length ? `${message}：${detailMessages.join('；')}` : message, status, code)
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
