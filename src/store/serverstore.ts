import { defineStore } from 'pinia'


export interface IShareSiteModel {
  title: string
  url: string
  tip: string
  group: string
  color: string
  external: string
}

export interface IShareSiteGroupModel {
  group: string,
  title: string
}

export interface ServerState {
  shareSiteList: IShareSiteModel[]
  shareSiteGroupList: IShareSiteGroupModel[]
}

const useServerStore = defineStore('serverstore', {
  state: (): ServerState => ({
    shareSiteList: [],
    shareSiteGroupList: []
  }),
  actions: {

    mSaveShareSiteList(shareSiteList: IShareSiteModel[]) {
      this.shareSiteList = shareSiteList || []
    },

    mSaveShareSiteGroupList(shareSiteGroupList: IShareSiteGroupModel[]) {
      this.shareSiteGroupList = shareSiteGroupList || []
    }
  }
})

export default useServerStore
