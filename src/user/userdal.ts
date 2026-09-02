import DB from '../utils/db'
import AliUser from '../aliapi/user'
import message from '../utils/message'
import useUserStore, { ITokenInfo } from './userstore'
import {
  useAppStore,
  useFootStore,
  useMyFollowingStore,
  useMyShareStore,
  useOtherFollowingStore,
  usePanFileStore,
  usePanTreeStore,
  useSettingStore
} from '../store'
import PanDAL from '../pan/pandal'
import DebugLog from '../utils/debuglog'
import { supportsAliyunAutoSign } from './autoSignPolicy'
import type { IAliGetFileModel } from '../aliapi/alimodels'
import { withStartupTimeout } from '../utils/startupTask'
import { setActiveUserToken } from '../tauri/app'

export const UserTokenMap = new Map<string, ITokenInfo>()

export default class UserDAL {
  private static async ensureTokenReady(token: ITokenInfo, force = false): Promise<ITokenInfo | null> {
    try {
      const ok = !!(token.user_id && (await AliUser.ApiTokenRefreshAccount(token, force)))
      return ok ? token : null
    } catch (err: any) {
      DebugLog.mSaveDanger('ensureTokenReady', err)
      return null
    }
  }

  static async aLoadFromDB() {
    const tokenList = await DB.getUserAll()
    const defaultUser = await DB.getValueString('uiDefaultUser')
    UserTokenMap.clear()
    // 先把所有账号塞进 UserTokenMap，保证 UserInfo 历史账号列表 + 切换可用，
    // 不受“默认账号加载失败”影响
    for (const token of tokenList) {
      if (token?.user_id) UserTokenMap.set(token.user_id, token)
    }

    // 排序：默认账号优先；其次按 used_size（getUserAll 已倒序，即“最常用”）
    const orderedTokens: ITokenInfo[] = []
    if (defaultUser) {
      const idx = tokenList.findIndex((t) => t.user_id === defaultUser)
      if (idx >= 0) {
        orderedTokens.push(tokenList[idx])
        for (let i = 0; i < tokenList.length; i++) {
          if (i !== idx) orderedTokens.push(tokenList[i])
        }
      } else {
        orderedTokens.push(...tokenList)
      }
    } else {
      orderedTokens.push(...tokenList)
    }

    let hasLogin = false
    let defaultUserLoaded = false
    let loadedIndex = -1
    for (let index = 0; index < orderedTokens.length; index++) {
      const token = orderedTokens[index]
      // 还未选出可登录账号：依次尝试。任意一步失败都 fallback 到下一个
      try {
        const prepared = await withStartupTimeout(this.ensureTokenReady(token), `账号 ${token?.user_id || ''} 初始化`)
        if (!prepared?.user_id) continue
        await this.UserLogin(prepared)
        hasLogin = true
        loadedIndex = index
        if (defaultUser && prepared.user_id === defaultUser) defaultUserLoaded = true
        break
      } catch (err: any) {
        DebugLog.mSaveDanger('aLoadFromDB userLogin ' + (token?.user_id || ''), err)
        // 失败的账号 token 已在 UserTokenMap 中（顶部统一塞过），
        // UserInfo.vue 仍可列出并支持手动切换
      }
    }
    if (loadedIndex >= 0) {
      const pendingTokens = orderedTokens.slice(loadedIndex + 1)
      void (async () => {
        for (const token of pendingTokens) {
          try {
            const prepared = await withStartupTimeout(this.ensureTokenReady(token), `后台刷新账号 ${token?.user_id || ''}`)
            if (prepared?.user_id) await this.UserAutoSign(prepared)
          } catch (err: any) {
            DebugLog.mSaveDanger('aLoadFromDB autoSign ' + (token?.user_id || ''), err)
          }
        }
      })()
    }
    if (defaultUser && !defaultUserLoaded) {
      console.log('aLoadFromDB defaultUser failed, fallback used. defaultUser=', defaultUser)
    }
    if (!hasLogin) {
      useUserStore().userShowLogin = true
    }
  }


  static async aRefreshAllUserToken() {
    const tokenList = await DB.getUserAll()
    const dateNow = new Date().getTime()
    for (let i = 0, maxi = tokenList.length; i < maxi; i++) {
      const token = tokenList[i]
      try {
        const expire_time = new Date(token.expire_time).getTime()
        const session_expire_time = new Date(token.session_expires_in).getTime()
        // 自动刷新Token(过期前5分钟)
        if (expire_time - dateNow <= 1000 * 60 * 5) {
          await AliUser.ApiTokenRefreshAccount(token, false, true)
          await AliUser.OpenApiTokenRefreshAccount(token, false, true)
        }
        if (session_expire_time - dateNow <= 1000 * 60) {
          await AliUser.ApiSessionRefreshAccount(token, false, true)
        }
      } catch (err: any) {
        DebugLog.mSaveDanger('aRefreshAllUserToken', err)
      }
    }
  }

  static GetUserToken(user_id: string): ITokenInfo {
    if (user_id && UserTokenMap.has(user_id)) {
      const token = UserTokenMap.get(user_id)!
      // 历史账号在 tokenfrom 成为必填项之前就已经保存过了
      if (token.user_id && token.tokenfrom !== 'aliyun') token.tokenfrom = 'aliyun'
      return token
    }

    return {
      tokenfrom: 'unknown',
      access_token: '',
      refresh_token: '',

      session_expires_in: 0,
      open_api_token_type: '',
      open_api_access_token: '',
      open_api_refresh_token: '',
      open_api_expires_in: 0,

      expires_in: 0,
      token_type: '',
      user_id: '',
      user_name: '',
      avatar: '',
      nick_name: '',
      default_drive_id: '',
      default_sbox_drive_id: '',
      resource_drive_id: '',
      backup_drive_id: '',
      sbox_drive_id: '',
      role: '',
      status: '',
      expire_time: '',
      state: '',
      pin_setup: false,
      is_first_login: false,
      need_rp_verify: false,
      name: '',
      spu_id: '',
      is_expires: false,
      used_size: 0,
      total_size: 0,
      free_size: 0,
      space_expire: false,
      spaceinfo: '',
      vipname: '',
      vipexpire: '',
      vipIcon: '',
      pic_drive_id: '',
      device_id: '',
      signature: '',
      signInfo: {
        signMon: -1,
        signDay: -1
      }
    }
  }

  static async GetUserTokenFromDB(user_id: string) {
    if (!user_id) return undefined
    if (UserTokenMap.has(user_id)) return UserTokenMap.get(user_id)
    const user = await DB.getUser(user_id)
    if (user) UserTokenMap.set(user.user_id, user)
    return user
  }

  static async EnsureUserTokenReady(user_id: string, force = false): Promise<ITokenInfo | null> {
    if (!user_id) return null
    const token = UserTokenMap.get(user_id) || await this.GetUserTokenFromDB(user_id)
    return token ? this.ensureTokenReady(token, force) : null
  }


  static GetUserList() {
    const list: ITokenInfo[] = []
    // eslint-disable-next-line no-unused-vars
    for (const [_, token] of UserTokenMap) {
      list.push(token)
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }

  static async GetUserListFromDB(): Promise<ITokenInfo[]> {
    const list = await DB.getUserAll()
    for (const token of list) {
      if (token.user_id && !UserTokenMap.has(token.user_id)) {
        UserTokenMap.set(token.user_id, token)
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }


  static SaveUserToken(token: ITokenInfo) {
    if (token.user_id) {
      UserTokenMap.set(token.user_id, token)
      DB.saveUser(token).catch(() => {
      })
    }
  }


  static async UserLogin(token: ITokenInfo, isInteractive: boolean = false) {
    const loadingKey = 'userlogin_' + Date.now().toString()
    message.loading('加载用户信息中...', 0, loadingKey)
    try {
      await UserDAL._UserLogin(token, isInteractive, loadingKey)
    } catch (err: any) {
      DebugLog.mSaveDanger('UserLogin ' + (token?.user_id || ''), err)
      message.error('加载用户信息失败：' + (err?.message || err), 6, loadingKey)
      throw err
    }
  }

  private static async _UserLogin(token: ITokenInfo, isInteractive: boolean, loadingKey: string) {
    const initialUserId = token.user_id
    if (initialUserId) {
      await DB.saveValueString('uiDefaultUser', initialUserId)
      useUserStore().userLogin(initialUserId)
      UserTokenMap.set(initialUserId, token)
    }
    const refreshAccountInfo = async () => {
      await Promise.all([
        AliUser.ApiUserInfo(token),
        AliUser.ApiUserDriveInfo(token),
        AliUser.ApiUserPic(token),
        AliUser.ApiUserVip(token),
        AliUser.ApiSessionRefreshAccount(token, false),
        AliUser.OpenApiTokenRefreshAccount(token, false),
        UserDAL.UserAutoSign(token)
      ])
    }
    if (isInteractive || !initialUserId) {
      // Bounded, but never fatal: a slow endpoint must not leave the user stuck on the login toast.
      try {
        await withStartupTimeout(refreshAccountInfo(), `账号 ${initialUserId || ''} 用户信息`, 20_000)
      } catch (err: any) {
        DebugLog.mSaveWarning('UserLogin refreshAccountInfo ' + initialUserId, err?.message || err)
        message.warning('账号信息加载超时，已跳过，稍后自动重试', 5)
      }
    } else {
      void withStartupTimeout(refreshAccountInfo(), `后台刷新账号 ${initialUserId} 用户信息`)
        .then(() => UserDAL.SaveUserToken(token))
        .catch((err: any) => DebugLog.mSaveWarning('UserLogin refreshAccountInfo ' + initialUserId, err?.message || err))
    }
    if (token.user_id && token.user_id !== initialUserId) {
      if (initialUserId) {
        UserTokenMap.delete(initialUserId)
        await DB.deleteUser(initialUserId)
      }
      await DB.saveValueString('uiDefaultUser', token.user_id)
      useUserStore().userLogin(token.user_id)
    } else if (token.user_id) {
      useUserStore().userLogin(token.user_id)
    }
    UserDAL.SaveUserToken(token)
    setActiveUserToken({
      user_id: token.user_id,
      name: token.user_name,
      access_token: token.access_token,
      open_api_access_token: token.open_api_access_token,
      tokenfrom: token.tokenfrom,
      login: true
    })
    // 已保存账号优先进入网盘，目录和账号资料在后台补全，避免任一网盘阻塞启动。
    const loadPanData = UserDAL.LoadPanData(token)
    if (isInteractive) {
      try {
        await withStartupTimeout(loadPanData, `账号 ${token.user_id} 网盘目录`, 30_000)
      } catch (err: any) {
        DebugLog.mSaveWarning('UserLogin LoadPanData ' + token.user_id, err?.message || err)
        message.warning('网盘目录加载失败：' + (err?.message || err), 5)
      }
    } else {
      void loadPanData.catch((err: any) => DebugLog.mSaveWarning('UserLogin LoadPanData ' + token.user_id, err?.message || err))
    }
    // 刷新所有状态
    PanDAL.aReLoadQuickFile(token.user_id)
    useAppStore().resetTab(useSettingStore().uiDefaultTab || 'pan')
    useMyShareStore().$reset()
    useMyFollowingStore().$reset()
    useOtherFollowingStore().$reset()
    useFootStore().mSaveUserInfo(token)
    message.success('加载用户成功!', 2, loadingKey)
  }

  static async LoadPanData(token: ITokenInfo) {
    // 刷新网盘数据
    if (!useSettingStore().securityHideResourceDrive) {
      await PanDAL.aReLoadResourceDrive(token)
    }
    if (!useSettingStore().securityHideBackupDrive) {
      await PanDAL.aReLoadBackupDrive(token)
    }
    if (useSettingStore().uiShowPanRootFirst === 'resource') {
      await PanDAL.aReLoadOneDirToShow(token.resource_drive_id, 'resource_root', true)
    } else if (useSettingStore().uiShowPanRootFirst === 'backup')  {
      await PanDAL.aReLoadOneDirToShow(token.backup_drive_id, 'backup_root', true)
    } else {
      await PanDAL.aReLoadOneDirToShow(token.resource_drive_id, 'resource_root', true)
      await PanDAL.aReLoadOneDirToShow(token.backup_drive_id, 'backup_root', true)
    }
  }

  static async UserLogOff(user_id: string): Promise<boolean> {
    await DB.deleteUser(user_id)
    UserTokenMap.delete(user_id)

    let newUserID = ''
    for (const [user_id] of UserTokenMap) {
      const token = await this.EnsureUserTokenReady(user_id)
      if (token) {
        await this.UserLogin(token)
        newUserID = user_id
        break
      }
    }
    if (!newUserID) {
      useUserStore().userLogOff()
      usePanTreeStore().$reset()
      usePanFileStore().$reset()
      useUserStore().userShowLogin = true
    }
    return newUserID != ''
  }

  static async UserClearFromDB(user_id: string): Promise<void> {
    DB.deleteUser(user_id)
    UserTokenMap.delete(user_id)
  }


  static async UserChange(user_id: string): Promise<boolean> {
    const token = await this.EnsureUserTokenReady(user_id)
    if (!token) {
      message.warning('该账号需要重新登陆[' + (UserTokenMap.get(user_id)?.name || user_id) + ']')
      return false
    }
    await this.UserLogin(token).catch()
    return true
  }


  static async UserRefreshByUserFace(user_id: string, force: boolean): Promise<boolean> {
    const token = UserDAL.GetUserToken(user_id)
    if (!token || !token.access_token) {
      return false
    }
    const expiresIn = new Date(token.expire_time).getTime() - token.expires_in * 1000
    const time = Date.now() - expiresIn
    const refreshProviderInfo = async () => {
      await Promise.all([
        AliUser.ApiUserInfo(token),
        AliUser.ApiUserPic(token),
        AliUser.ApiUserVip(token)
      ])
    }
    if (!force || time / 1000 < 600) {
      await refreshProviderInfo()
      UserDAL.SaveUserToken(token)
      return true
    }
    if (!token.user_id) return false
    const isToken = await AliUser.ApiTokenRefreshAccount(token, true)
    if (!isToken) return false
    await AliUser.ApiSessionRefreshAccount(token, true)
    await AliUser.OpenApiTokenRefreshAccount(token, true)
    await refreshProviderInfo()
    useUserStore().userLogin(token.user_id)
    UserDAL.SaveUserToken(token)
    return true
  }

  static async UserAutoSign(token: ITokenInfo) {
    // 自动签到
    if (!supportsAliyunAutoSign(token)) {
      UserDAL.SaveUserToken(token)
      return
    }
    if (token.user_id && useSettingStore().uiLaunchAutoSign) {
      const nowMonth = new Date().getMonth() + 1
      const nowDay = new Date().getDate()
      if (!token.signInfo) token.signInfo = { signMon: -1, signDay: -1 }
      const signInfo = token.signInfo
      if (signInfo.signMon !== nowMonth || signInfo.signDay !== nowDay) {
        const signDay = await AliUser.ApiUserSign(token)
        if (signDay) {
          signInfo.signMon = nowMonth
          signInfo.signDay = signDay
        }
      }
    }
    UserDAL.SaveUserToken(token)
  }
}

/** 找到能访问这个文件所在网盘的账号Token，优先用文件自己记录的账号 */
export const resolveDriveFileToken = async (file: Pick<IAliGetFileModel, 'drive_id'> & { user_id?: string }, preferredUserId = ''): Promise<ITokenInfo | undefined> => {
  const candidateUserIds = [file.user_id, preferredUserId].filter((userId, index, values): userId is string => !!userId && values.indexOf(userId) === index)
  for (const userId of candidateUserIds) {
    const token = await UserDAL.GetUserTokenFromDB(userId)
    if (token?.access_token && token.user_id && file.drive_id) return token
  }
  return undefined
}
