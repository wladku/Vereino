// Expands an e-mail's React tree into plain (host) elements by calling its function components — `EmailLayout` and a
// template's body are plain functions without hooks. The platform's `sendEmail` test capture walks the tree as given
// and never renders components, so without this the capture would miss the layout's club name and footer; the real
// transport renders the same tree to HTML either way.
import * as React from 'react'

type AnyProps = Record<string, unknown> & { children?: React.ReactNode }

function isFunctionComponent(type: unknown): type is (props: AnyProps) => React.ReactNode {
  // A class component has a `prototype.isReactComponent`; it would need `new`, so it is left as it is.
  return (
    typeof type === 'function' && !(type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent
  )
}

export function expandEmailTree(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) return node.map((child) => expandEmailTree(child as React.ReactNode))
  if (!React.isValidElement<AnyProps>(node)) return node
  if (isFunctionComponent(node.type)) return expandEmailTree(node.type(node.props))
  if (node.props.children === undefined) return node
  return React.cloneElement(node, undefined, ...React.Children.toArray(expandEmailTree(node.props.children)))
}
