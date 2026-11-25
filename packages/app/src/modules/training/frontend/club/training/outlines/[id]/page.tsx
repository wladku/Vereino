import { OutlineEditorPage } from '../../../../../components/club/OutlineEditorPage'

export default function TrainingOutlineRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <OutlineEditorPage id={id} />
}
