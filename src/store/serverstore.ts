import { defineStore } from 'pinia'


export interface IShareSiteModel {
  title: string
  url: string
  tip: string
  group: string
  color: string
}

export interface IShareSiteGroupModel {
  group: string,
  title: string
}

interface ServerState {
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
