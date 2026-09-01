<script lang="ts">
import { defineComponent, ref, watch } from 'vue'
import { useWinStore, WinState } from '../store'

/** Smallest sidebar width we are willing to restore: below this the divider is hard to grab. */
const OPEN_MIN_WIDTH = 160
const RIGHT_MIN_WIDTH = 220
const DEFAULT_WIDTH = 240

function readStoredSize(key: string): number {
  try {
    const raw = parseInt(localStorage.getItem(key) || '', 10)
    return Number.isFinite(raw) && raw >= OPEN_MIN_WIDTH ? raw : 0
  } catch {
    return 0
  }
}

export default defineComponent({
  props: {
    visible: {
      type: Boolean,
      required: false,
      default: true
    },
    /** localStorage key the divider position is remembered under. */
    storageKey: {
      type: String,
      required: false,
      default: 'mysplit-pan'
    }
  },
  emits: ['splitSize'],
  setup(props) {
    const leftMinWidth = 0
    const winStore = useWinStore()
    const bodyWidth = ref(Math.max(winStore.width, 900))
    const splitMoveing = ref(false)
    const splitSizeMax = ref(bodyWidth.value - RIGHT_MIN_WIDTH)

    const clamp = (size: number) => Math.min(Math.max(size, OPEN_MIN_WIDTH), Math.max(splitSizeMax.value, OPEN_MIN_WIDTH))
    /** Width the sidebar returns to when shown — restored from the last drag. */
    const openSize = ref(clamp(readStoredSize(props.storageKey) || DEFAULT_WIDTH))
    const splitSize = ref(props.visible ? openSize.value + 'px' : '0px')

    winStore.$subscribe((_m: any, state: WinState) => {
      const width = state.width
      if (width <= 0 || bodyWidth.value == width) return
      bodyWidth.value = width
      splitSizeMax.value = width - RIGHT_MIN_WIDTH
      openSize.value = clamp(openSize.value)
      if (props.visible && parseInt(splitSize.value, 10) > splitSizeMax.value) splitSize.value = openSize.value + 'px'
    })

    watch(() => props.visible, (visible) => {
      splitSize.value = visible ? openSize.value + 'px' : '0px'
    })

    const onMoveEnd = () => {
      splitMoveing.value = false
      if (!props.visible) return
      const size = parseInt(splitSize.value, 10)
      if (!Number.isFinite(size)) return
      openSize.value = clamp(size)
      try {
        localStorage.setItem(props.storageKey, String(openSize.value))
      } catch {
        /* private mode / storage disabled: the divider just won't be remembered */
      }
    }

    return { splitSize, leftMinWidth, splitSizeMax, splitMoveing, onMoveEnd }
  }
})
</script>

<template>
  <a-split v-model:size="splitSize" class="MySplit" style="height: 100%; width: 100%;"
           :min="leftMinWidth" :max="splitSizeMax" tabindex="-1"
           @move-start="splitMoveing = true" @move-end="onMoveEnd">
    <template #first>
      <slot name="first">first</slot>
    </template>
    <template #resize-trigger>
      <div class="splitline" :class="splitMoveing ? 'resize' : ''" draggable="false">
        <div class="line" draggable="false"></div>
      </div>
    </template>
    <template #second>
      <slot name="second">second</slot>
    </template>
  </a-split>
</template>
<style>
.MySplit .arco-split-pane {
  overflow: hidden;
}
.splitline {
  position: relative;
  box-sizing: border-box;
  width: 4px;
  height: 100%;
  border: 0;
  user-select: none;
  margin-right: 2px;
}
.splitline::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 1px;
  width: 1px;
  background: rgba(31, 35, 41, 0.3);
  content: '';
}
body[arco-theme='dark'] .splitline::before {
  background: rgba(255, 255, 255, 0.28);
}
.splitline:hover {
  background: rgb(var(--primary-6));
  cursor: col-resize;
}
.splitline:hover::before,
.splitline.resize::before {
  background: transparent;
}
.splitline.resize {
  background: rgb(var(--primary-6));
}
.splitline .line {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 60px;
  margin-top: -30px;
  background: rgb(var(--primary-6));
}
</style>
