import { describe, expect, it } from 'vitest'
import { validateVenue } from './venue'
import type { CreateVenueInput } from '../types'

const valid: CreateVenueInput = {
  name: '排练室', location: '教学楼 3 层', capacity: 20,
  open_time: '08:00', close_time: '22:00', status: 'OPEN',
}

describe('场地创建表单校验', () => {
  it('接受有效场地资料与停用状态', () => {
    expect(validateVenue(valid)).toEqual([])
    expect(validateVenue({ ...valid, status: 'CLOSED' })).toEqual([])
  })

  it('拒绝空白名称和位置、非正整数容量、错误或逆序开放时间', () => {
    const fields = validateVenue({
      ...valid, name: ' ', location: '\t', capacity: 1.5,
      open_time: '25:00', close_time: '07:00',
    }).map(({ field }) => field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'location', 'capacity', 'open_time']))
    expect(validateVenue({ ...valid, open_time: '22:00' }).some(({ field }) => field === 'close_time')).toBe(true)
  })

  it('拒绝超过契约长度的文字和无效状态', () => {
    const fields = validateVenue({ ...valid, name: '甲'.repeat(101), location: '乙'.repeat(201), status: 'INVALID' as 'OPEN' })
      .map(({ field }) => field)
    expect(fields).toEqual(expect.arrayContaining(['name', 'location', 'status']))
  })
})
