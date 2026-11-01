import { describe, expect, it } from 'vitest'
import { parseRoute } from './navigation'

describe('页面地址', () => {
  it('解析场地概览、指定场地预约和预约记录', () => {
    expect(parseRoute('')).toEqual({ kind: 'home' })
    expect(parseRoute('#/')).toEqual({ kind: 'home' })
    expect(parseRoute('#/venues/12/book')).toEqual({ kind: 'booking', venueId: 12 })
    expect(parseRoute('#/reservations')).toEqual({ kind: 'reservations' })
  })

  it('解析公开的场地创建页', () => {
    expect(parseRoute('#/venues/new')).toEqual({ kind: 'createVenue' })
  })

  it('解析场地和预约详情地址', () => {
    expect(parseRoute('#/venues/12')).toEqual({ kind: 'venueDetail', venueId: 12 })
    expect(parseRoute('#/reservations/34')).toEqual({ kind: 'reservationDetail', reservationId: 34 })
    expect(parseRoute('#/venues/0')).toEqual({ kind: 'notFound' })
    expect(parseRoute('#/reservations/abc')).toEqual({ kind: 'notFound' })
  })

  it('拒绝无效或不支持的地址', () => {
    expect(parseRoute('#/venues/0/book')).toEqual({ kind: 'notFound' })
    expect(parseRoute('#/venues/abc/book')).toEqual({ kind: 'notFound' })
    expect(parseRoute('#/anything')).toEqual({ kind: 'notFound' })
  })
})
