import type { InjectionWidgetModule } from '@open-mercato/shared/modules/widgets/injection'
import type { LoginFormWidgetContext } from '@open-mercato/core/modules/auth/frontend/login-injection'
import LoginIdentityWidget from './widget.client'

/** "Sign in with Google" on `/login` (#566), on the platform spot `auth.login:form`; shown to guests. */
const widget: InjectionWidgetModule<LoginFormWidgetContext, Record<string, unknown>> = {
  metadata: {
    id: 'foundation.injection.login-identity',
    title: 'Login: social sign-in buttons',
    description: 'One button per enabled sign-in provider and the generic sign-in failure sentence.',
    priority: 100,
    enabled: true,
  },
  Widget: LoginIdentityWidget,
}

export default widget
