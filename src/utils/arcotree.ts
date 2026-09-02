interface TreeLikeNode {
  key: string | number
  children?: TreeLikeNode[]
}

/**
 * Arco tree nodes carry no `parent` back-reference, so walk the rendered data to find the
 * top-level ancestor of `key` (used to map a folder back to the drive root it belongs to).
 */
export function findTreeRootKey(roots: TreeLikeNode[], key: string | number): string {
  const walk = (nodes: TreeLikeNode[], rootKey: string): string => {
    for (let i = 0, maxi = nodes.length; i < maxi; i++) {
      const node = nodes[i]
      if (node.key === key) return rootKey
      const children = node.children
      if (children && children.length > 0) {
        const found = walk(children, rootKey)
        if (found) return found
      }
    }
    return ''
  }
  for (let i = 0, maxi = roots.length; i < maxi; i++) {
    const root = roots[i]
    if (root.key === key) return String(root.key)
    const found = walk(root.children || [], String(root.key))
    if (found) return found
  }
  return ''
}

/**
 * Folders expand when their row is clicked (`action-on-node-click="expand"`), leaves have nothing
 * to expand so clicking one toggles its checkbox instead — what the Ant Design trees used to do by
 * synthesising a click on the checkbox element.
 */
export function treeSelectToCheck(tree: any, node?: { key?: string | number; isLeaf?: boolean }) {
  if (!tree || !node || !node.isLeaf || node.key === undefined) return
  tree.toggleCheck(node.key)
}
