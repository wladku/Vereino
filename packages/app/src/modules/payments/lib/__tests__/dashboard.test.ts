import { describe, expect, it } from '@jest/globals'
import { CAMPAIGN_STATUSES } from '../order-campaigns'
import {
  BANK_TO_DECIDE_STATUSES,
  DASHBOARD_ONLY,
  RUNNING_CAMPAIGN_STATUSES,
  WITHOUT_PAYER_LIST_LIMIT,
  isRunningCampaign,
  moreCount,
} from '../dashboard'

describe('isRunningCampaign', () => {
  it('keeps every stage but a draft and a completed campaign', () => {
    expect(CAMPAIGN_STATUSES.filter(isRunningCampaign)).toEqual([...RUNNING_CAMPAIGN_STATUSES])
    expect(isRunningCampaign('draft')).toBe(false)
    expect(isRunningCampaign('completed')).toBe(false)
  })
})

describe('moreCount', () => {
  it('counts the charges not listed', () => {
    expect(moreCount(8, WITHOUT_PAYER_LIST_LIMIT)).toBe(3)
    expect(moreCount(5, 5)).toBe(0)
  })

  it('never goes below zero', () => {
    expect(moreCount(2, 5)).toBe(0)
  })
})

describe('dashboard constants', () => {
  it('waits on "To confirm" and "Unmatched" transfers and answers only the counts', () => {
    expect(BANK_TO_DECIDE_STATUSES).toEqual(['suggested', 'unmatched'])
    expect(DASHBOARD_ONLY).toEqual(['counts'])
  })
})
