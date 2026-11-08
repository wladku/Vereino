'use client'
// `/backend/payments/orders/create` and `/[id]/edit` — B-31 the order form wizard (UX concept README B-31; payments
// spec REQ-032; issue #115): the campaign (name 3–120, section, parent description, groups as chips with "Select
// all", the orders and payment deadlines, supplier), personalisation (print name and number, a notes question) and
// the products (children's and adult sizes and prices, "answer required", at most one set of at least two products).
// A new form starts blank, from the "Academy kit" template or as a copy of an earlier campaign. "Save draft" keeps it
// a draft; "Save and open collection" opens it and lands on the campaign page with the Messenger text.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CAMPAIGN_DESCRIPTION_MAX,
  CAMPAIGN_NAME_MAX,
  CAMPAIGN_NAME_MIN,
  CAMPAIGN_TEXT_MAX,
  PRODUCT_NAME_MAX,
  isCampaignEditable,
  productDrafts,
  type ProductKind,
} from '../../lib/order-campaigns'
import { errorMessage, fromGrosz, localToday, toGrosz, type Translate } from '../client-helpers'
import {
  ORDERS_HREF,
  campaignApi,
  campaignHref,
  campaignOptions,
  parseSizes,
  sectionGroups,
  sectionOptions,
  type CampaignDetail,
  type Option,
} from './orders-client'

const ENTITY_ID = 'payments:order_campaign'
const FORM_ID = 'order-campaign-form'

/** A product as the form edits it: sizes and prices as typed text. */
type ProductRow = {
  key: string
  id?: string
  name: string
  kind: ProductKind
  componentKeys: string[]
  sizesChild: string
  sizesAdult: string
  priceChild: string
  priceAdult: string
  requiredAnswer: boolean
  used: boolean
}

type CampaignFormValues = Record<string, unknown> & {
  name: string
  sectionId: string
  groupIds: string[]
  description: string
  closesOn: string
  paymentDueOn: string
  supplierName: string
  askPrintName: boolean
  askPrintNumber: boolean
  notesLabel: string
  products: ProductRow[]
  updatedAt?: string | null
}

let keySeed = 0
function newKey(): string {
  keySeed += 1
  return `new-${String(Date.now())}-${String(keySeed)}`
}

function blankProduct(kind: ProductKind): ProductRow {
  return {
    key: newKey(),
    name: '',
    kind,
    componentKeys: [],
    sizesChild: '',
    sizesAdult: '',
    priceChild: '',
    priceAdult: '',
    requiredAnswer: kind === 'item',
    used: false,
  }
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function blankValues(): CampaignFormValues {
  const today = localToday()
  return {
    name: '',
    sectionId: '',
    groupIds: [],
    description: '',
    closesOn: addDays(today, 14),
    paymentDueOn: addDays(today, 21),
    supplierName: '',
    askPrintName: false,
    askPrintNumber: false,
    notesLabel: '',
    products: [blankProduct('item')],
  }
}

const CHILD_SIZES = '116, 128, 140, 152, 164'
const ADULT_SIZES = 'S, M, L, XL'

/** The "Academy kit" template of the mockup: shirt, shorts and socks, and the three as a set. */
function templateValues(t: Translate): CampaignFormValues {
  const shirt = { ...blankProduct('item'), name: t('payments.orders.template.shirt') }
  const shorts = { ...blankProduct('item'), name: t('payments.orders.template.shorts') }
  const socks = { ...blankProduct('item'), name: t('payments.orders.template.socks') }
  return {
    ...blankValues(),
    name: t('payments.orders.template.name'),
    askPrintName: true,
    askPrintNumber: true,
    notesLabel: t('payments.orders.template.notes'),
    products: [
      { ...shirt, sizesChild: CHILD_SIZES, sizesAdult: ADULT_SIZES, priceChild: '60', priceAdult: '75' },
      { ...shorts, sizesChild: CHILD_SIZES, sizesAdult: ADULT_SIZES, priceChild: '40', priceAdult: '50' },
      { ...socks, sizesChild: '31–34, 35–38', sizesAdult: '39–42, 43–46', priceChild: '20', priceAdult: '20' },
      {
        ...blankProduct('set'),
        name: t('payments.orders.template.set'),
        componentKeys: [shirt.key, shorts.key, socks.key],
        priceChild: '110',
      },
    ],
  }
}

/** A stored campaign as form values: editing keeps the ids; a copy drops them and starts with fresh dates. */
function detailValues(detail: CampaignDetail, copy: boolean): CampaignFormValues {
  const used = new Set(detail.products.filter((product) => product.used).map((product) => product.id))
  const blank = blankValues()
  return {
    name: copy ? '' : detail.name,
    sectionId: detail.sectionId,
    groupIds: detail.groups.map((group) => group.id),
    description: detail.description ?? '',
    closesOn: copy ? blank.closesOn : detail.closesOn,
    paymentDueOn: copy ? blank.paymentDueOn : detail.paymentDueOn,
    supplierName: detail.supplierName ?? '',
    askPrintName: detail.askPrintName,
    askPrintNumber: detail.askPrintNumber,
    notesLabel: detail.notesLabel ?? '',
    products: productDrafts(detail.products, copy).map((draft) => ({
      ...draft,
      sizesChild: draft.sizesChild.join(', '),
      sizesAdult: draft.sizesAdult.join(', '),
      priceChild: fromGrosz(draft.priceChild),
      priceAdult: draft.priceAdult === null ? '' : fromGrosz(draft.priceAdult),
      used: !copy && !!draft.id && used.has(draft.id),
    })),
    ...(copy ? {} : { updatedAt: detail.updatedAt }),
  }
}

/** The request body; a price that is not a number stops the save with a field error. */
function toPayload(values: CampaignFormValues, t: Translate, open: boolean) {
  if (values.groupIds.length === 0) {
    const message = t('payments.orders.validation.groupsRequired')
    throw createCrudFormError(message, { groupIds: message })
  }
  const products = values.products.map((product) => {
    const priceChild = toGrosz(product.priceChild)
    const priceAdult = product.priceAdult.trim() ? toGrosz(product.priceAdult) : null
    if (priceChild === null || (product.priceAdult.trim() && priceAdult === null)) {
      const message = t('payments.orders.validation.price', { name: product.name || '—' })
      throw createCrudFormError(message, { products: message })
    }
    return {
      ...(product.id ? { id: product.id } : {}),
      key: product.key,
      name: product.name.trim(),
      kind: product.kind,
      componentKeys: product.kind === 'set' ? product.componentKeys : [],
      sizesChild: product.kind === 'set' ? [] : parseSizes(product.sizesChild),
      sizesAdult: product.kind === 'set' ? [] : parseSizes(product.sizesAdult),
      priceChild,
      priceAdult: product.kind === 'set' ? null : priceAdult,
      requiredAnswer: product.requiredAnswer,
    }
  })
  const optional = (value: string) => (value.trim() ? value.trim() : null)
  return {
    name: values.name.trim(),
    description: optional(values.description),
    sectionId: values.sectionId,
    groupIds: values.groupIds,
    closesOn: values.closesOn,
    paymentDueOn: values.paymentDueOn,
    askPrintName: values.askPrintName,
    askPrintNumber: values.askPrintNumber,
    notesLabel: optional(values.notesLabel),
    supplierName: optional(values.supplierName),
    products,
    open,
  }
}

function GroupChips({
  sectionId,
  value,
  setValue,
  error,
  t,
}: {
  sectionId: string
  value: string[]
  setValue: (value: string[]) => void
  error?: string
  t: Translate
}) {
  const query = useQuery({
    queryKey: ['payments-order-section-groups', sectionId],
    queryFn: () => sectionGroups(sectionId),
    enabled: !!sectionId,
  })
  if (!sectionId) return <p className="text-muted-foreground text-sm">{t('payments.orders.form.groupsPickSection')}</p>
  const groups: Option[] = query.data ?? []
  const all = groups.length > 0 && groups.every((group) => value.includes(group.value))
  return (
    <div className="flex flex-col gap-2" data-testid="order-campaign-groups">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={all}
            disabled={groups.length === 0}
            data-testid="order-campaign-groups-all"
            onCheckedChange={(checked) => {
              setValue(checked === true ? groups.map((group) => group.value) : [])
            }}
          />
          {t('payments.orders.form.selectAll')}
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('payments.orders.fields.groups')}>
        {groups.map((group) => {
          const selected = value.includes(group.value)
          return (
            <label
              key={group.value}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                selected ? 'border-primary bg-primary/10' : 'border-border'
              }`}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => {
                  setValue(
                    checked === true ? [...value, group.value] : value.filter((groupId) => groupId !== group.value),
                  )
                }}
              />
              {group.label}
            </label>
          )
        })}
        {query.isSuccess && groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('payments.orders.form.noGroups')}</p>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ProductCard({
  product,
  index,
  items,
  onChange,
  onRemove,
  t,
}: {
  product: ProductRow
  index: number
  items: ProductRow[]
  onChange: (patch: Partial<ProductRow>) => void
  onRemove: () => void
  t: Translate
}) {
  const id = React.useId()
  const isSet = product.kind === 'set'
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3" data-testid={`order-product-${String(index)}`}>
      <legend className="px-1 text-sm font-medium">
        {isSet ? t('payments.orders.products.setLegend') : t('payments.orders.products.itemLegend')}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-name`}>{t('payments.orders.products.name')}</Label>
          <Input
            id={`${id}-name`}
            data-testid={`order-product-${String(index)}-name`}
            value={product.name}
            maxLength={PRODUCT_NAME_MAX}
            onChange={(event) => {
              onChange({ name: event.target.value })
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-price-child`}>
            {isSet ? t('payments.orders.products.setPrice') : t('payments.orders.products.priceChild')}
          </Label>
          <Input
            id={`${id}-price-child`}
            data-testid={`order-product-${String(index)}-price-child`}
            inputMode="decimal"
            value={product.priceChild}
            onChange={(event) => {
              onChange({ priceChild: event.target.value })
            }}
          />
        </div>
        {isSet ? null : (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-sizes-child`}>{t('payments.orders.products.sizesChild')}</Label>
              <Input
                id={`${id}-sizes-child`}
                data-testid={`order-product-${String(index)}-sizes-child`}
                placeholder={CHILD_SIZES}
                value={product.sizesChild}
                onChange={(event) => {
                  onChange({ sizesChild: event.target.value })
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-sizes-adult`}>{t('payments.orders.products.sizesAdult')}</Label>
              <Input
                id={`${id}-sizes-adult`}
                data-testid={`order-product-${String(index)}-sizes-adult`}
                placeholder={ADULT_SIZES}
                value={product.sizesAdult}
                onChange={(event) => {
                  onChange({ sizesAdult: event.target.value })
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-price-adult`}>{t('payments.orders.products.priceAdult')}</Label>
              <Input
                id={`${id}-price-adult`}
                data-testid={`order-product-${String(index)}-price-adult`}
                inputMode="decimal"
                value={product.priceAdult}
                onChange={(event) => {
                  onChange({ priceAdult: event.target.value })
                }}
              />
            </div>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {isSet ? t('payments.orders.products.setHelp') : t('payments.orders.products.sizesHelp')}
      </p>
      {isSet ? (
        <div className="flex flex-wrap gap-3" role="group" aria-label={t('payments.orders.products.components')}>
          {items.map((item) => (
            <label key={item.key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={product.componentKeys.includes(item.key)}
                onCheckedChange={(checked) => {
                  onChange({
                    componentKeys:
                      checked === true
                        ? [...product.componentKeys, item.key]
                        : product.componentKeys.filter((key) => key !== item.key),
                  })
                }}
              />
              {item.name || t('payments.orders.products.unnamed')}
            </label>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={product.requiredAnswer}
            onCheckedChange={(checked) => {
              onChange({ requiredAnswer: checked === true })
            }}
          />
          {t('payments.orders.products.required')}
        </label>
        <div className="flex items-center gap-2">
          {product.used ? (
            <span className="text-muted-foreground text-xs">{t('payments.orders.products.used')}</span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={product.used}
            data-testid={`order-product-${String(index)}-remove`}
            onClick={onRemove}
          >
            {t('payments.orders.products.remove')}
          </Button>
        </div>
      </div>
    </fieldset>
  )
}

function ProductsEditor({
  value,
  setValue,
  error,
  t,
}: {
  value: ProductRow[]
  setValue: (value: ProductRow[]) => void
  error?: string
  t: Translate
}) {
  const items = value.filter((product) => product.kind === 'item')
  const hasSet = value.some((product) => product.kind === 'set')
  return (
    <div className="flex flex-col gap-3" data-testid="order-campaign-products">
      {value.map((product, index) => (
        <ProductCard
          key={product.key}
          product={product}
          index={index}
          items={items}
          t={t}
          onChange={(patch) => {
            setValue(value.map((row) => (row.key === product.key ? { ...row, ...patch } : row)))
          }}
          onRemove={() => {
            setValue(
              value
                .filter((row) => row.key !== product.key)
                .map((row) => ({ ...row, componentKeys: row.componentKeys.filter((key) => key !== product.key) })),
            )
          }}
        />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="order-product-add"
          onClick={() => {
            setValue([...value, blankProduct('item')])
          }}
        >
          {t('payments.orders.products.add')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={hasSet}
          data-testid="order-product-add-set"
          onClick={() => {
            setValue([...value, blankProduct('set')])
          }}
        >
          {t('payments.orders.products.addSet')}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert" data-testid="order-campaign-products-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function useCampaignFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'name',
        label: t('payments.orders.fields.name'),
        type: 'text',
        required: true,
        maxLength: CAMPAIGN_NAME_MAX,
        description: t('payments.orders.fields.name.help', { min: CAMPAIGN_NAME_MIN, max: CAMPAIGN_NAME_MAX }),
      },
      {
        id: 'sectionId',
        label: t('payments.orders.fields.section'),
        type: 'select',
        required: true,
        loadOptions: async () => {
          try {
            return await sectionOptions()
          } catch {
            return []
          }
        },
        layout: 'half',
      },
      {
        id: 'supplierName',
        label: t('payments.orders.fields.supplier'),
        type: 'text',
        maxLength: CAMPAIGN_TEXT_MAX,
        layout: 'half',
      },
      {
        id: 'groupIds',
        label: t('payments.orders.fields.groups'),
        type: 'custom',
        // Checked on submit with the issue's own message ("Select at least one group"), not the generic one.
        rendersOwnError: true,
        component: ({ value, setValue, error, values }) => (
          <GroupChips
            sectionId={typeof values?.sectionId === 'string' ? values.sectionId : ''}
            value={Array.isArray(value) ? (value as string[]) : []}
            setValue={setValue}
            error={error}
            t={t}
          />
        ),
      },
      {
        id: 'description',
        label: t('payments.orders.fields.description'),
        type: 'textarea',
        maxLength: CAMPAIGN_DESCRIPTION_MAX,
        description: t('payments.orders.fields.description.help'),
      },
      {
        id: 'closesOn',
        label: t('payments.orders.fields.closesOn'),
        type: 'date',
        required: true,
        layout: 'half',
      },
      {
        id: 'paymentDueOn',
        label: t('payments.orders.fields.paymentDueOn'),
        type: 'date',
        required: true,
        layout: 'half',
        description: t('payments.orders.fields.paymentDueOn.help'),
      },
      { id: 'askPrintName', label: t('payments.orders.fields.askPrintName'), type: 'checkbox', layout: 'half' },
      { id: 'askPrintNumber', label: t('payments.orders.fields.askPrintNumber'), type: 'checkbox', layout: 'half' },
      {
        id: 'notesLabel',
        label: t('payments.orders.fields.notesLabel'),
        type: 'text',
        maxLength: CAMPAIGN_TEXT_MAX,
        description: t('payments.orders.fields.notesLabel.help'),
      },
      {
        id: 'products',
        label: t('payments.orders.fields.products'),
        type: 'custom',
        rendersOwnError: true,
        component: ({ value, setValue, error }) => (
          <ProductsEditor
            value={Array.isArray(value) ? (value as ProductRow[]) : []}
            setValue={setValue}
            error={error}
            t={t}
          />
        ),
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'campaign',
        title: t('payments.orders.groups.campaign'),
        column: 1,
        fields: ['name', 'sectionId', 'supplierName', 'groupIds', 'description', 'closesOn', 'paymentDueOn'],
      },
      {
        id: 'personalisation',
        title: t('payments.orders.groups.personalisation'),
        column: 1,
        fields: ['askPrintName', 'askPrintNumber', 'notesLabel'],
      },
      { id: 'products', title: t('payments.orders.groups.products'), column: 1, fields: ['products'] },
    ],
    [t],
  )
  return { fields, groups }
}

function OpenCollectionButton({ t }: { t: Translate }) {
  return (
    <Button type="submit" form={FORM_ID} name="intent" value="open" variant="outline" data-testid="order-campaign-open">
      {t('payments.orders.actions.saveAndOpen')}
    </Button>
  )
}

type SaveResponse = { id: string; status: string }

/** After a save: the campaign page, which shows the Messenger text when collection was just opened. */
function afterSave(router: ReturnType<typeof useRouter>, id: string, opened: boolean) {
  router.push(opened ? `${campaignHref(id)}?share=1` : campaignHref(id))
}

type StartingPoint = { kind: 'blank' } | { kind: 'template' } | { kind: 'copy'; id: string }

function StartingPointPicker({ onPick, t }: { onPick: (point: StartingPoint) => void; t: Translate }) {
  const copyId = React.useId()
  const campaigns = useQuery({ queryKey: ['payments-order-campaign-options'], queryFn: campaignOptions })
  return (
    <section className="bg-card flex flex-col gap-3 rounded-lg border p-4" data-testid="order-campaign-start">
      <h2 className="text-sm font-medium">{t('payments.orders.start.title')}</h2>
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onPick({ kind: 'blank' })
          }}
        >
          {t('payments.orders.start.blank')}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="order-campaign-start-template"
          onClick={() => {
            onPick({ kind: 'template' })
          }}
        >
          {t('payments.orders.start.template')}
        </Button>
        <div className="flex flex-col gap-1">
          <Label htmlFor={copyId}>{t('payments.orders.start.copy')}</Label>
          <Select
            onValueChange={(value: string) => {
              onPick({ kind: 'copy', id: value })
            }}
          >
            <SelectTrigger id={copyId} className="w-64" data-testid="order-campaign-start-copy">
              <SelectValue placeholder={t('payments.orders.start.copyPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(campaigns.data ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}

export function OrderCampaignCreateForm() {
  const t = useT()
  const router = useRouter()
  const { fields, groups } = useCampaignFields(t)
  const [start, setStart] = React.useState<{ version: number; values: CampaignFormValues }>(() => ({
    version: 0,
    values: blankValues(),
  }))

  const pick = async (point: StartingPoint) => {
    if (point.kind === 'blank') setStart((prev) => ({ version: prev.version + 1, values: blankValues() }))
    else if (point.kind === 'template') setStart((prev) => ({ version: prev.version + 1, values: templateValues(t) }))
    else {
      const call = await apiCall<CampaignDetail>(campaignApi(point.id))
      if (!call.ok || !call.result) {
        flash(t('payments.orders.errors.load'), 'error')
        return
      }
      const values = detailValues(call.result, true)
      setStart((prev) => ({ version: prev.version + 1, values }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <StartingPointPicker
        t={t}
        onPick={(point) => {
          void pick(point)
        }}
      />
      <CrudForm<CampaignFormValues>
        key={start.version}
        formId={FORM_ID}
        title={t('payments.orders.create.title')}
        titleHeadingLevel={1}
        backHref={ORDERS_HREF}
        cancelHref={ORDERS_HREF}
        entityId={ENTITY_ID}
        fields={fields}
        groups={groups}
        initialValues={start.values}
        submitLabel={t('payments.orders.actions.saveDraft')}
        extraActions={<OpenCollectionButton t={t} />}
        onSubmit={async (values, context) => {
          const open = context?.submitter?.value === 'open'
          const call = await createCrud<SaveResponse>('payments/order-campaigns', toPayload(values, t, open))
          const id = call.result?.id
          if (!id) throw new Error(t('payments.orders.errors.save'))
          flash(t(open ? 'payments.orders.flash.opened' : 'payments.orders.flash.saved'), 'success')
          afterSave(router, id, open)
        }}
      />
    </div>
  )
}

export function OrderCampaignEditForm({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  const { fields, groups } = useCampaignFields(t)
  const query = useQuery({
    queryKey: ['payments-order-campaign', id],
    queryFn: async () => {
      const call = await apiCall<CampaignDetail>(campaignApi(id))
      if (call.status === 404) return null
      if (!call.ok || !call.result) throw new Error(t('payments.orders.errors.load'))
      return call.result
    },
  })
  const detail = query.data ?? null

  if (query.isSuccess && !detail) {
    return (
      <RecordNotFoundState
        label={t('payments.orders.errors.notFound')}
        backHref={ORDERS_HREF}
        backLabel={t('payments.orders.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('payments.orders.errors.load'))} />
  if (detail && !isCampaignEditable(detail.status)) {
    return <ErrorMessage label={t('payments.errors.order_campaign_not_editable')} />
  }

  return (
    <CrudForm<CampaignFormValues>
      key={detail ? detail.updatedAt : 'loading'}
      formId={FORM_ID}
      title={t('payments.orders.edit.title')}
      titleHeadingLevel={1}
      backHref={campaignHref(id)}
      cancelHref={campaignHref(id)}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('payments.orders.loading')}
      initialValues={detail ? { ...detailValues(detail, false), id } : blankValues()}
      submitLabel={detail?.status === 'draft' ? t('payments.orders.actions.saveDraft') : t('payments.common.save')}
      extraActions={detail?.status === 'draft' ? <OpenCollectionButton t={t} /> : undefined}
      onSubmit={async (values, context) => {
        const open = context?.submitter?.value === 'open'
        // CrudForm adds the optimistic-lock header from `initialValues.updatedAt`.
        await updateCrud<SaveResponse>('payments/order-campaigns', { id, ...toPayload(values, t, open) })
        flash(t(open ? 'payments.orders.flash.opened' : 'payments.orders.flash.saved'), 'success')
        afterSave(router, id, open)
      }}
    />
  )
}
