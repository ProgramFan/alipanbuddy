<script setup lang="ts">

import { modalCloseAll } from '../../utils/modal'
import { nextTick, onBeforeUnmount, PropType, ref } from 'vue'
import { IServerVerData } from '../../aliapi/server'
import MarkdownIt from 'markdown-it'
import { openExternal } from '../../utils/electronhelper'
import message from '../../utils/message'
import { Progress as AntdProgress } from 'ant-design-vue'
import useFootStore from '../../store/footstore'

const props = defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  verData: {
    type: Object as PropType<IServerVerData>,
    required: true
  }
})
const okLoading = ref(false)
const percent = ref(0)
const loaded = ref(0)
const footStore = useFootStore()
let unlistenState: (() => void) | undefined

const stopListening = () => {
  if (unlistenState) {
    unlistenState()
    unlistenState = undefined
  }
}

// Mirrors the backend updater state (window.AutoUpdateOnStateChanged) into the progress bar.
const applyState = (state: any) => {
  if (!state || !state.status) return
  if (state.status === 'downloading') {
    okLoading.value = true
    const raw = typeof state.percent === 'number' ? state.percent : percent.value
    const pro = Math.min(100, Math.max(0, Math.round(raw)))
    percent.value = pro
    loaded.value = props.verData.fileSize ? Math.round((props.verData.fileSize * pro) / 100) : 0
    footStore.mSaveUpdateDownloadProgress(pro)
  } else if (state.status === 'downloaded') {
    percent.value = 100
    loaded.value = props.verData.fileSize
    footStore.mSaveUpdateDownloadProgress(0)
    okLoading.value = false
    message.info(state.version ? `新版本 ${state.version} 已下载，正在安装...` : '新版本已下载，正在安装...', 0)
    window.AutoUpdateInstall?.()
  } else if (state.status === 'error') {
    okLoading.value = false
    percent.value = 0
    loaded.value = 0
    footStore.mSaveUpdateDownloadProgress(0)
    message.error(state.message ? `新版本下载失败：${state.message}，请前往github下载最新版本` : '新版本下载失败，请前往github下载最新版本', 8)
    openExternal(props.verData.verHtml)
  }
}

const handleOpen = async () => {
  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true
  })
  await nextTick(() => {
    const el = document.getElementById('markdown-content')
    if (el) el.innerHTML = markdown.render(props.verData.verInfo || '')
  })
  stopListening()
  unlistenState = window.AutoUpdateOnStateChanged?.(applyState)
}

const handleHide = () => {
  stopListening()
  if (okLoading.value) okLoading.value = false
  percent.value = 0
  loaded.value = 0
  footStore.mSaveUpdateDownloadProgress(0)
  modalCloseAll()
}

onBeforeUnmount(() => {
  stopListening()
})

const handleOK = async () => {
  const { verHtml } = props.verData
  okLoading.value = true
  try {
    const state = await window.AutoUpdateCheck?.(true)
    if (!state || state.status === 'unsupported') {
      // no in-app updater (e.g. unpackaged / unsupported platform) -> open the release page
      okLoading.value = false
      openExternal(verHtml)
    } else if (state.status === 'downloading') {
      message.info(state.version ? `新版本 ${state.version} 正在后台下载，完成后将自动安装` : '新版本正在后台下载，完成后将自动安装', 5)
      applyState(state)
    } else if (state.status === 'downloaded') {
      applyState(state)
    } else if (state.status === 'up-to-date') {
      okLoading.value = false
      message.info('已经是最新版', 6)
    } else if (state.status === 'error') {
      okLoading.value = false
      message.error(state.message ? `检查更新失败：${state.message}，请前往github下载最新版本` : '检查更新失败，请前往github下载最新版本', 8)
      openExternal(verHtml)
    } else {
      // 'idle' | 'checking' – the state listener will pick up the rest
      message.info('正在检查更新')
    }
  } catch (err: any) {
    okLoading.value = false
    message.error(err?.message || '检查更新失败，请前往github下载最新版本', 8)
    openExternal(verHtml)
  }
}
</script>

<template>
  <a-modal :visible='visible'
           modal-class='modalclass updatemodal'
           :unmount-on-close='true'
           :mask-closable='false'
           :closable="false"
           @cancel='handleHide'
           @before-open='handleOpen'>
    <template #title>
      <span class='vermodaltitle' style="max-width: 540px">
        <IconFont name="iconyibu" class="verupdate-icon" />
        发现新版本<span class='vertip'>{{ verData.version }}</span>
      </span>
    </template>
    <div class='vermodalbody'>
      <div id='markdown-content' />
    </div>
    <template #footer>
      <div class='modalfoot'>
        <AntdProgress
          v-show="percent > 0"
          size="small"
          style="width: 250px;"
          status='active'
          :stroke-color="{
              '0%': '#ffba7a',
              '8.56%': '#ff74c7',
              '26.04%': '#637dff',
              '100%': 'rgba(99, 125, 255, 0.2)',
            }"
          :percent="percent">
          <template #format="percent">
            {{ `${percent}%(${loaded}/${props.verData.fileSize})` }}
          </template>
        </AntdProgress>
        <div style='flex-grow: 1'></div>
        <a-button type='outline' size='small' @click='handleHide'>{{ okLoading ? '后台下载' : '取消' }}</a-button>
        <a-button type='primary' size='small' :loading='okLoading' @click='handleOK'>更新</a-button>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
.vermodaltitle {
  display: flex;
  align-items: center;
  line-height: 48px;
}

.vermodalbody {
  width: 540px;
  max-height: calc(70vh - 100px);
  flex-direction: column;
  justify-content: center;
  align-items: center;
  overflow-x: hidden;
  padding: 0 16px 16px 16px !important;
}

.verupdate-icon {
  font-size: 20px;
  color: rgb(40, 104, 240);
  margin-right: 8px;
  line-height: 1;
}

.vertip {
  padding-left: 12px;
  color: rgb(40, 104, 240);
  flex-grow: 1;
}
</style>
