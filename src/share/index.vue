<script setup lang='ts'>
import ShareSiteRight from './share/ShareSiteRight.vue'
import MyShareRight from './share/MyShareRight.vue'
import MyTransferShareRight from './share/MyTransferShareRight.vue'
import OtherShareRight from './share/OtherShareRight.vue'
import MyFollowingRight from './following/MyFollowingRight.vue'

import { useAppStore, useUserStore } from '../store'
import ShareDAL from './share/ShareDAL'
import FollowingDAL from './following/FollowingDAL'
import { ref } from 'vue'
import ShareHistoryRight from './share/ShareHistoryRight.vue'
import ShareBottleFishRight from './share/ShareBottleFishRight.vue'
import { t } from '../i18n'

const appStore = useAppStore()
const hideLeft = ref(false)
const userStore = useUserStore()
withDefaults(defineProps<{ sidebarVisible?: boolean }>(), { sidebarVisible: true })

appStore.$subscribe(() => {
  const appPage = appStore.GetAppTabMenu
  const uid = userStore.user_id
  if (!uid) return
  if (appPage == 'ShareSiteRight') ShareDAL.aLoadShareSite()
  if (appPage == 'MyShareRight') ShareDAL.aReloadMyShare(uid, false)
  if (appPage == 'ShareHistoryRight') ShareDAL.aReloadShareHistory(uid, false)
  if (appPage == 'MyTransferShareRight') ShareDAL.aReloadMyTransferShare(uid, false)
  if (appPage == 'ShareBottleFishRight') ShareDAL.aReloadShareBottleFish(uid, false)
  if (appPage == 'MyFollowingRight') FollowingDAL.aReloadMyFollowing(uid, false)
})

const handleHideLeft = (val: boolean) => {
  hideLeft.value = val
}
</script>

<template>
  <a-layout style='height: 100%'>
    <a-layout-sider v-show="sidebarVisible && !hideLeft" hide-trigger :width='218' :resize-directions="['right']" class='xbyleft single-boundary-sidebar'>
      <div class='headdesc'>{{ t('share.title') }}</div>
      <a-menu :selected-keys='[appStore.GetAppTabMenu]' :style="{ width: '100%' }" class='xbyleftmenu single-boundary-sidebar-menu'
              @update:selected-keys="appStore.toggleTabMenu('share', $event[0])">
        <a-menu-item key='ShareSiteRight'>
          <template #icon><IconFont name="iconrvip" /></template>
          {{ t('share.resources') }}
        </a-menu-item>
        <a-menu-item key='OtherShareRight'>
          <template #icon><IconFont name="iconfenxiang1" /></template>
          {{ t('share.imported') }}
        </a-menu-item>
        <a-menu-item key='ShareHistoryRight'>
          <template #icon><IconFont name="iconfenxiang1" /></template>
          {{ t('share.history') }}
        </a-menu-item>
        <a-menu-item key='MyShareRight'>
          <template #icon><IconFont name="iconfenxiang" /></template>
          {{ t('share.mine') }}
        </a-menu-item>
        <a-menu-item key='MyTransferShareRight'>
          <template #icon><IconFont name="iconfenxiang" /></template>
          {{ t('share.transfer') }}
        </a-menu-item>
        <a-menu-item key='ShareBottleFishRight'>
          <template #icon><IconFont name="icontuijian" /></template>
          {{ t('share.lucky') }}
        </a-menu-item>
        <a-menu-item key='MyFollowingRight'>
          <template #icon><IconFont name="icondingyue" /></template>
          {{ t('share.following') }}
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout-content class='xbyright'>
      <a-tabs :type="'text'" :direction="'horizontal'" class='hidetabs' :justify='true'
              :active-key='appStore.GetAppTabMenu'>
        <a-tab-pane key='ShareSiteRight' title='1'>
          <ShareSiteRight @hide-left='handleHideLeft' />
        </a-tab-pane>
        <a-tab-pane key='OtherShareRight' title='2'>
          <OtherShareRight />
        </a-tab-pane>
        <a-tab-pane key='MyShareRight' title='3'>
          <MyShareRight />
        </a-tab-pane>
        <a-tab-pane key='ShareHistoryRight' title='3'>
          <ShareHistoryRight />
        </a-tab-pane>
        <a-tab-pane key='MyTransferShareRight' title='4'>
          <MyTransferShareRight />
        </a-tab-pane>
        <a-tab-pane key='ShareBottleFishRight' title='5'>
          <ShareBottleFishRight />
        </a-tab-pane>
        <a-tab-pane key='MyFollowingRight' title='5'>
          <MyFollowingRight />
        </a-tab-pane>
      </a-tabs>
    </a-layout-content>
  </a-layout>
</template>

<style></style>
