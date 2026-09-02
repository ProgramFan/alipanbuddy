<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { KeyboardState, useAppStore, useKeyboardStore } from '../store'
import { TestAlt, TestKey } from '../utils/keyboardhelper'
import { t } from '../i18n'
import { windowCmd } from '../tauri/app'
import Config from '../config'

/** Global installed by Alibaba's WebOffice SDK, loaded on demand from Config.webOfficeSdkUrl. */
declare const aliyun: { config(options: { mount: Element; url: string }): { setToken(token: { token: string }): void } } | undefined

const appStore = useAppStore()
const keyboardStore = useKeyboardStore()
const pageOffice = appStore.pageOffice
const title = pageOffice?.file_name || t('office.preview')
/** `sdk`: the SDK mounted the viewer and received the token; `iframe`: plain preview page (no token or SDK unavailable). */
const mode = ref<'loading' | 'sdk' | 'iframe'>('loading')
const mount = ref<HTMLElement>()

keyboardStore.$subscribe((_m: any, state: KeyboardState) => {
  if (TestAlt('f4', state.KeyDownEvent, handleHideClick)) return
  if (TestAlt('m', state.KeyDownEvent, handleMinClick)) return
  if (TestAlt('enter', state.KeyDownEvent, handleMaxClick)) return
  if (TestKey('f11', state.KeyDownEvent, handleMaxClick)) return
})

const onKeyDown = (event: KeyboardEvent) => {
  const ele = (event.srcElement || event.target) as any
  const nodeName = ele && ele.nodeName
  if (event.key == 'Control' || event.key == 'Shift' || event.key == 'Alt' || event.key == 'Meta') return
  const isInput = nodeName == 'INPUT' || nodeName == 'TEXTAREA' || false
  if (!isInput) keyboardStore.KeyDown(event)
}

const handleHideClick = () => {
  windowCmd('close')
}
const handleMinClick = () => {
  windowCmd('minsize')
}
const handleMaxClick = () => {
  windowCmd('maxsize')
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof aliyun !== 'undefined') return resolve()
    const script = document.createElement('script')
    script.src = Config.webOfficeSdkUrl
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('WebOffice SDK failed to load'))
    document.head.appendChild(script)
  })
}

onMounted(async () => {
  document.title = title
  window.addEventListener('keydown', onKeyDown, true)
  if (!pageOffice?.preview_url || !pageOffice.access_token || !mount.value) {
    mode.value = 'iframe'
    return
  }
  try {
    await loadSdk()
    const viewer = aliyun!.config({ mount: mount.value, url: pageOffice.preview_url })
    viewer.setToken({ token: pageOffice.access_token })
    mode.value = 'sdk'
  } catch {
    mode.value = 'iframe'
  }
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <a-layout style="height: 100vh" draggable="false">
    <a-layout-header id="xbyhead" draggable="false">
      <div id="xbyhead2" class="q-electron-drag">
        <a-button type="text" tabindex="-1">
          <IconFont name="iconfile-doc" />
        </a-button>
        <div class="title">{{ title }}</div>
        <div class="flexauto"></div>
        <a-button type="text" tabindex="-1" :title="t('common.minimize') + ' Alt+M'" @click="handleMinClick">
          <IconFont name="iconzuixiaohua" />
        </a-button>
        <a-button type="text" tabindex="-1" :title="t('common.maximize') + ' Alt+Enter'" @click="handleMaxClick">
          <IconFont name="iconfullscreen" />
        </a-button>
        <a-button type="text" tabindex="-1" :title="t('common.close') + ' Alt+F4'" @click="handleHideClick">
          <IconFont name="iconclose" />
        </a-button>
      </div>
    </a-layout-header>
    <a-layout-content class="office-content">
      <div v-show="mode !== 'iframe'" ref="mount" class="office-preview"></div>
      <iframe v-if="mode === 'iframe'" class="office-preview" :src="pageOffice?.preview_url || ''"></iframe>
      <div v-if="mode === 'loading'" class="office-loading">{{ t('office.loading') }}</div>
    </a-layout-content>
  </a-layout>
</template>

<style>
.office-content {
  position: relative;
  height: calc(100vh - 42px);
  background: #fff;
}
.office-preview,
.office-preview iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
.office-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
  pointer-events: none;
}
</style>
