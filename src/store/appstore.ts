import DebugLog from '../utils/debuglog'
import { onHideRightMenu } from '../utils/keyboardhelper'
import { defineStore } from 'pinia'
import { IAliGetFileModel } from '../aliapi/alimodels'

export interface IPageImage {
  user_id: string
  drive_id: string
  file_id: string
  file_name: string
  mode: string
  password: string
  imageList: IAliGetFileModel[]
}

export interface AppState {
  appTheme: string

  appPage: string

  appTab: string

  appTabMenuMap: Map<string, string>
  appDark: boolean
  appShutDown: boolean


  pageImage?: IPageImage
}

const useAppStore = defineStore('app', {
  state: (): AppState => ({
    appTheme: 'light',
    appPage: 'PageLoading',
    appTab: 'pan',
    appTabMenuMap: new Map<string, string>([
      ['pan', 'wangpan'],
      ['down', 'DowningRight'],
      ['share', 'ShareSiteRight'],
      ['rss', 'RssXiMa'],
      ['setting', 'SettingUI']
    ]),
    appDark: false,
    appShutDown: false
  }),

  getters: {
    GetAppTabMenu(state: AppState): string {
      return state.appTabMenuMap.get(state.appTab)!
    }
  },

  actions: {
    updateStore(partial: Partial<AppState>) {
      this.$patch(partial)
    },

    toggleTheme(theme: string) {
      // console.log('toggleTheme', theme, this)
      this.appTheme = theme
      if (this.appTheme == 'dark' || (this.appTheme == 'system' && this.appDark)) {
        document.body.setAttribute('arco-theme', 'dark')
      } else {
        document.body.removeAttribute('arco-theme')
      }
    },

    toggleDark(dark: boolean) {
      console.log('toggleDark', dark, this)
      this.appDark = dark
      if (this.appTheme == 'dark' || (this.appTheme == 'system' && dark)) {
        document.body.setAttribute('arco-theme', 'dark')
      } else {
        document.body.removeAttribute('arco-theme')
      }
    },

    togglePage(page: string) {
      if (page == this.appPage) return
      this.appPage = page
    },
    resetTab(defaultTab = 'pan') {
      this.$patch({
        appTab: defaultTab,
        appTabMenuMap: new Map<string, string>([
          ['pan', 'wangpan'],
          ['down', 'DowningRight'],
          ['share', 'ShareSiteRight'],
          ['rss', 'RssXiMa'],
          ['setting', 'SettingUI']
        ])
      })
    },

    toggleTab(tab: string) {
      if (this.appTab != tab) {
        this.appTab = tab
        if (tab == 'setting') DebugLog.aLoadFromDB()
        onHideRightMenu()
      }
    },

    toggleTabMenu(tab: string, menu: string) {
      if (this.appTab != tab) {
        this.appTab = tab
        if (tab == 'setting') DebugLog.aLoadFromDB()
      }
      this.appTabMenuMap.set(tab, menu)
      if (tab == 'setting') document.getElementById(menu)?.scrollIntoView()
      onHideRightMenu()
    },

    toggleTabSetting(tab: string, menu: string) {
      if (tab == this.appTab && this.appTabMenuMap.get(tab) == menu) return
      if (this.appTab != tab) {
        this.appTab = tab
      }
      if (menu) {
        this.appTabMenuMap.set(tab, menu)
      }
    },

    toggleTabNext() {
      switch (this.appTab) {
        case 'pan': {
          this.appTab = 'down'
          break
        }
        case 'down': {
          this.appTab = 'share'
          break
        }
        case 'share': {
          this.appTab = 'rss'
          break
        }
        case 'rss': {
          this.appTab = 'setting'
          DebugLog.aLoadFromDB()
          break
        }
        case 'setting': {
          this.appTab = 'pan'
          break
        }
      }
      onHideRightMenu()
    },

    toggleTabNextMenu() {
      const next = function(map: Map<string, string>, tab: string, menuList: string[]) {
        const menu = map.get(tab)!
        for (let i = 0, maxi = menuList.length; i < maxi; i++) {
          if (menuList[i] == menu) {
            if (i + 1 >= menuList.length) map.set(tab, menuList[0])
            else map.set(tab, menuList[i + 1])
          }
        }
      }

      switch (this.appTab) {
        case 'pan': {
          next(this.appTabMenuMap, this.appTab, ['wangpan', 'kuaijie'])
          break
        }
        case 'down': {
          next(this.appTabMenuMap, this.appTab, ['DowningRight', 'DownedRight', 'UploadingRight', 'UploadedRight'])
          break
        }
        case 'share': {
          next(this.appTabMenuMap, this.appTab, ['ShareSiteRight', 'OtherShareRight', 'MyShareRight', 'ShareHistoryRight', 'MyTransferShareRight', 'ShareBottleFishRight', 'MyFollowingRight', 'OtherFollowingRight'])
          break
        }
        case 'rss': {
          next(this.appTabMenuMap, this.appTab, ['RssXiMa', 'RssJiaMi', 'RssEmptyDirs', 'AppSame', 'RssScanClean', 'RssScanSame', 'RssScanPunish', 'RssScanEnmpty', 'RssDriveCopy'])
          break
        }
        case 'setting': {
          next(this.appTabMenuMap, this.appTab, ['SettingUI', 'SettingAccount', 'SettingSecurity', 'SettingPan', 'SettingDown', 'SettingDownloadAdvanced', 'SettingUpload', 'SettingDebug', 'SettingProxy', 'SettingAria', 'SettingLog'])
          const menu = this.appTabMenuMap.get('setting')!
          document.getElementById(menu)?.scrollIntoView()
          break
        }
      }

      onHideRightMenu()
    }
  }
})

export default useAppStore
