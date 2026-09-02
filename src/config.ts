/** 本地固定口令：本地 aria2c 的 RPC secret，同时用作账号/密码等本地数据的加解密盐 */
export const localPwd = 'S4znWTaZYQi3cpRNb'

export default class Config {
  // 网络请求配置
  static referer = 'https://www.aliyundrive.com/drive'
  static downAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4577.63 Safari/537.36'
  /** Alibaba's WebOffice viewer SDK (global `aliyun`), loaded on demand by PageOffice; version pinned to the API PageOffice uses */
  static webOfficeSdkUrl = 'https://g.alicdn.com/IMM/office-js/1.1.5/aliyun-web-office-sdk.min.js'
  static loginUrl = 'https://auth.aliyundrive.com/v2/oauth/authorize?login_type=custom&response_type=code&redirect_uri=https%3A%2F%2Fwww.aliyundrive.com%2Fsign%2Fcallback&client_id=25dzX3vbYqktVxyX&state=%7B%22origin%22%3A%22https%3A%2F%2Fwww.aliyundrive.com%2F%22%7D'
}
