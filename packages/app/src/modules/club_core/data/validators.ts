// Request schemas of `club_core` (shared by routes and commands).
import { clubSettingsPatchSchema } from '../lib/settings'

/** Body of `PUT /api/club_core/settings`: any subset of the settings; unknown keys (e.g. scope ids) are rejected. */
export const clubSettingsUpdateSchema = clubSettingsPatchSchema.strict()
