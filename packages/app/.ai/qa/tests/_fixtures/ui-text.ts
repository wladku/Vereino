// UI texts for the integration tests, read from the i18n catalogs (lesson `qa-ui-texts-from-catalogs`): a test names
// the catalog key and gets the English and the Polish text as one pattern, so a wording change never breaks it and a
// renamed key fails `yarn verify` (`qa-texts:check`). Never write a UI text as a literal such as
// `/^(Save|Zapisz)$/`; write `uiText('common.save', { exact: true })`.
// - `exact: true` matches the whole text (`^…$`); without it the text may sit inside a longer one.
// - `params` fills placeholders (`{name}`); a placeholder without a value matches any text.
import { createUiText } from '../../../../scripts/vereino-ui-texts.mjs'

export const uiText = createUiText()
