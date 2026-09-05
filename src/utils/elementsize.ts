import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * Content-box height of an element, kept current by a ResizeObserver. Arco's virtual tree needs a pixel
 * height (and a row buffer derived from it, see treeVirtualListProps); measuring the box the tree sits in
 * keeps it filling the pane, which subtracting layout constants from the window height never reliably did.
 */
export function useElementHeight(target: Ref<HTMLElement | undefined>): Ref<number> {
  const height = ref(0)
  const observer = new ResizeObserver((entries) => {
    const rect = entries[entries.length - 1]?.contentRect
    if (rect) height.value = Math.floor(rect.height)
  })
  watch(
    target,
    (el, old) => {
      if (old) observer.unobserve(old)
      if (el) {
        observer.observe(el)
        height.value = Math.floor(el.clientHeight)
      } else {
        height.value = 0
      }
    },
    { immediate: true, flush: 'post' }
  )
  onBeforeUnmount(() => observer.disconnect())
  return height
}
