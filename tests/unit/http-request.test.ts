import { describe, expect, it } from 'bun:test'
import { expectedStatuses, isExpectedStatus, monitorRequest, unexpectedStatusMessage } from '../../app/lib/httpRequest'

describe('the request an uptime monitor sends', () => {
  it('is a plain GET when the config says nothing', () => {
    expect(monitorRequest({})).toEqual({ method: 'GET', headers: {} })
  })

  it('POSTs an object body as JSON', () => {
    expect(monitorRequest({ method: 'post', body: { key: 'UPLK-0000' } })).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"key":"UPLK-0000"}',
    })
  })

  it('keeps a content-type the monitor chose, and a string body as given', () => {
    expect(monitorRequest({ method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: { a: 1 } }).headers).toEqual({ 'Content-Type': 'text/plain' })
    expect(monitorRequest({ method: 'POST', body: 'a=1' })).toEqual({ method: 'POST', headers: {}, body: 'a=1' })
  })

  it('never sends a body with GET or HEAD', () => {
    expect(monitorRequest({ method: 'HEAD', body: { a: 1 } })).toEqual({ method: 'HEAD', headers: {} })
    expect(monitorRequest({ body: 'x' }).body).toBeUndefined()
  })

  it('drops what could inject a header, and falls back to GET for a method it does not know', () => {
    expect(monitorRequest({ headers: { 'X-Ok': 'yes', 'Bad Name': 'x', 'X-Split': 'a\r\nInjected: 1', 'X-Num': 3, 'X-Obj': { a: 1 } } }).headers)
      .toEqual({ 'X-Ok': 'yes', 'X-Num': '3' })
    expect(monitorRequest({ method: 'TRACE' }).method).toBe('GET')
    expect(monitorRequest({ headers: ['x'] }).headers).toEqual({})
  })
})

describe('which statuses count as up', () => {
  it('is 2xx and 3xx by default', () => {
    expect(isExpectedStatus({}, 200)).toBe(true)
    expect(isExpectedStatus({}, 302)).toBe(true)
    expect(isExpectedStatus({}, 404)).toBe(false)
  })

  it('is exactly the expected codes when a monitor names them, so a healthy 404 is up and a 200 is not', () => {
    expect(isExpectedStatus({ expectedStatus: 404 }, 404)).toBe(true)
    expect(isExpectedStatus({ expectedStatus: 404 }, 200)).toBe(false)
    expect(isExpectedStatus({ expectedStatus: [400, '401'] }, 401)).toBe(true)
    expect(unexpectedStatusMessage({ expectedStatus: [404] }, 500)).toBe('Unexpected status code 500 (expected 404)')
  })

  it('ignores codes that are not HTTP statuses', () => {
    expect(expectedStatuses({ expectedStatus: [42, 'abc', 700, 2.5] })).toBeNull()
    expect(isExpectedStatus({ expectedStatus: 'nope' }, 200)).toBe(true)
  })
})
