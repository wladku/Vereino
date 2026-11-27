'use client'
import * as React from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type DemoState = { state: 'on' | 'read_only'; renewalNotice: boolean }
type Load = { kind: 'loading' } | { kind: 'off' } | { kind: 'error' } | { kind: 'ready'; value: DemoState }

export default function EnterpriseDemoPage() {
  const t = useT()
  const [load, setLoad] = React.useState<Load>({ kind: 'loading' })
  React.useEffect(() => {
    let active = true
    void apiCall<DemoState>('/api/enterprise_demo/state').then((call) => {
      if (!active) return
      if (call.status === 404) setLoad({ kind: 'off' })
      else if (!call.ok || !call.result) setLoad({ kind: 'error' })
      else setLoad({ kind: 'ready', value: call.result })
    })
    return () => {
      active = false
    }
  }, [])
  return (
    <Page>
      <PageBody>
        {load.kind === 'loading' ? <LoadingMessage label={t('enterprise_demo.page.loading')} /> : null}
        {load.kind === 'error' ? <ErrorMessage label={t('enterprise_demo.page.error')} /> : null}
        {load.kind === 'off' ? <RecordNotFoundState label={t('enterprise_demo.page.off')} /> : null}
        {load.kind === 'ready' ? (
          <div className="space-y-4" data-testid="enterprise-demo-state" data-state={load.value.state}>
            <p>
              {t('enterprise_demo.page.state', {
                state: t(load.value.state === 'on' ? 'enterprise_demo.state.on' : 'enterprise_demo.state.read_only'),
              })}
            </p>
            {load.value.state === 'read_only' ? (
              <Alert style="light" status="warning" data-testid="enterprise-demo-read-only">
                <AlertDescription>{t('enterprise_demo.page.readOnly')}</AlertDescription>
              </Alert>
            ) : load.value.renewalNotice ? (
              <Alert style="light" status="information" data-testid="enterprise-demo-renewal">
                <AlertDescription>{t('enterprise_demo.page.renewal')}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
      </PageBody>
    </Page>
  )
}
