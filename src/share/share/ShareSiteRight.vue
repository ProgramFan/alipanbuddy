<script setup lang='ts'>
import { IShareSiteModel, useServerStore } from '../../store'
import { B64decode } from '../../utils/format'
import { openExternal } from '../../tauri/app'
import ServerHttp from '../../aliapi/server'
import DebugLog from '../../utils/debuglog'

const serverStore = useServerStore()

// Sites open in the system browser; the in-app browser window (a second webview) never worked reliably.
const handleSite = (item: IShareSiteModel) => {
  const url = item.url.startsWith('http') ? item.url : B64decode(item.url)
  if (url) openExternal(url)
}

const handleRefreshSiteList = () => {
  ServerHttp.CheckConfigUpgrade().catch((err: any) => {
    DebugLog.mSaveDanger('CheckConfigUpgrade', err)
  })
}
</script>

<template>
  <a-tabs class='share-site-tabs'>
    <template #extra>
      <a-button type='text' size='large' tabindex='-1' @click='handleRefreshSiteList'>
        <IconFont name="iconreload-1-icon" />刷新列表
      </a-button>
    </template>
    <template v-if='serverStore.shareSiteGroupList.length > 0'>
      <a-tab-pane v-for='(item, index) in serverStore.shareSiteGroupList' :key='index' :title='item.title'>
        <a-card :bordered='false' class='site-list'>
          <template v-for='(siteItem, index) in serverStore.shareSiteList' :key='index'>
            <a-card-grid v-if='siteItem.group === item.group' :hoverable='index % 2 === 0' class='site-list-item'>
              <a :style='{ color: siteItem.color }' @click='handleSite(siteItem)' v-html='`${siteItem.title}<small>${siteItem.tip}</small>`' />
            </a-card-grid>
          </template>
        </a-card>
      </a-tab-pane>
    </template>
    <template v-else>
      <a-tab-pane title='全部'>
        <a-card :bordered='false' class='site-list'>
          <a-card-grid v-for='(siteItem, index) in serverStore.shareSiteList' :key='index' :hoverable='index % 2 === 0' class='site-list-item'>
            <a :style='{ color: siteItem.color }' @click='handleSite(siteItem)' v-html='`${siteItem.title}<small>${siteItem.tip}</small>`' />
          </a-card-grid>
        </a-card>
      </a-tab-pane>
    </template>
  </a-tabs>
</template>

<style lang='less'>
// The tab strip keeps its height and the active pane scrolls in the rest of the share page.
.share-site-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;

  > .arco-tabs-nav {
    flex: none;
  }

  > .arco-tabs-content {
    flex: 1 1 0;
    min-height: 0;
  }

  .arco-tabs-content-list,
  .arco-tabs-content .arco-tabs-content-item.arco-tabs-content-item-active,
  .arco-tabs-pane {
    height: 100%;
  }

  .arco-tabs-pane {
    overflow-y: auto;
  }

  .site-list {
    text-align: center;
    width: calc(100% - 32px);
    margin: 0 24px 24px 8px;
    box-sizing: border-box;

    .arco-card-header {
      border-bottom: none !important;
    }

    .site-list-item {
      width: 25%;
      padding: 26px 0;
      text-align: center;
      font-size: 16px;
      color: rgb(188, 143, 143);

      a {
        cursor: pointer;
        color: rgb(var(--color-link-light-2));
      }

      small {
        padding-left: 4px;
        font-size: 12px;
      }

      &:hover {
        background-color: var(--color-fill-2);
        color: rgb(var(--primary-6));
      }
    }
  }
}
</style>
