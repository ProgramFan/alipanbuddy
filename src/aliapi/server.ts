import { b64decode, Sleep } from '../utils/format'
import { getPkgVersion } from '../utils/utils'
import axios, { AxiosResponse } from 'axios'
import { IShareSiteGroupModel, IShareSiteModel } from '../store'
import ShareDAL from '../share/share/ShareDAL'
import { modalShowPost } from '../utils/modal'
import DebugLog from '../utils/debuglog'

export interface IServerRespData {
  state: string
  msg: string

  [k: string]: any
}

export default class ServerHttp {
  static baseApi = b64decode('aHR0cDovLzEyMS41LjE0NC44NDo1MjgyLw==')
  static configUrl = b64decode('aHR0cHM6Ly9naXRlZS5jb20vYXBpL3Y1L3JlcG9zL3poYW5uYW8vcmVzb3VyY2UvY29udGVudHMvc2hhcmVTaXRlQ29uZmlnLmpzb24=')

  static async Post(postData: any, isfirst = true): Promise<IServerRespData> {
    const url = ServerHttp.baseApi + 'xby2'
    return axios
      .post(url, postData, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {}
      })
      .then((response: AxiosResponse) => {
        if (response.status != 200) return { state: 'error', msg: '网络错误' }
        const buff = response.data as ArrayBuffer
        const uint8array = new Uint8Array(buff)
        for (let i = 0, maxi = uint8array.byteLength; i < maxi; i++) {
          uint8array[i] ^= 9 + (i % 200)
        }
        const str = new TextDecoder().decode(uint8array)
        return JSON.parse(str) as IServerRespData
      })
      .catch(() => {
        return { state: 'error', msg: '网络错误' }
      })
      .then(async (resp) => {
        if (resp.state == 'error' && resp.msg == '网络错误' && isfirst) {
          await Sleep(2000)
          return await ServerHttp.Post(postData, false)
        } else return resp
      })
  }


  static async PostToServer(postData: any): Promise<IServerRespData> {
    postData.appVersion = getPkgVersion()
    const str = JSON.stringify(postData)
    if (window.postdataFunc) {
      let enstr = ''
      try {
        enstr = window.postdataFunc(str)
        console.log(enstr)
      } catch {
        return { state: 'error', msg: '联网失败' }
      }
      return ServerHttp.Post(enstr).catch(() => {
        return { state: 'error', msg: '网络错误' }
      })
    } else {
      return { state: 'error', msg: '程序错误' }
    }
  }

  static async CheckConfigUpgrade(): Promise<void> {
    axios
      .get(ServerHttp.configUrl, {
        withCredentials: false,
        responseType: 'arraybuffer',
        timeout: 30000
      })
      .then(async (response: AxiosResponse) => {
        console.log('CheckConfigUpgrade', response)
        let apiData: any
        try {
          const buff = response.data as ArrayBuffer
          const uint8array = new Uint8Array(buff)
          const str = new TextDecoder().decode(uint8array)
          apiData = JSON.parse(str)
        } catch {
          DebugLog.mSaveDanger('CheckConfigUpgrade', new Error('JSON parse failed'))
          return
        }
        let jsonData: any
        if (apiData.content && apiData.encoding === 'base64') {
          const jsonStr = b64decode(apiData.content)
          if (!jsonStr) return
          try {
            jsonData = JSON.parse(jsonStr)
          } catch {
            DebugLog.mSaveDanger('CheckConfigUpgrade', new Error('inner JSON parse failed'))
            return
          }
        } else if (apiData.SSList) {
          jsonData = apiData
        } else {
          return
        }

        let GroupList: IShareSiteGroupModel[] = []
        if (jsonData.GroupList && jsonData.GroupList.length > 0) {
          const list = jsonData.GroupList
          for (let item of list) {
            GroupList.push({ group: item.group, title: item.title })
          }
          ShareDAL.SaveShareSiteGroup(GroupList)
        }
        if (jsonData.SSList && jsonData.SSList.length > 0) {
          const list: IShareSiteModel[] = []
          const SSList = jsonData.SSList
          for (let item of SSList) {
            const add: any = {
              title: item.title,
              url: item.url,
              tip: item.tip,
              group: item.group,
              color: item.color
            }
            if (add.url.length > 0) list.push(add)
          }
          ShareDAL.SaveShareSite(list)
        }
        if (jsonData.POST && jsonData.POST.length > 0) {
          let postId = localStorage.getItem('postmodal')
          if (!postId || postId != jsonData.POST_ID) {
            modalShowPost(jsonData.POST, jsonData.POST_ID)
          }
        }
      }).catch((err: any) => {
      DebugLog.mSaveDanger('CheckConfigUpgrade', err)
    })
  }
}
