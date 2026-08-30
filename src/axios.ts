import axios from 'axios'
import { tauriAxiosAdapter } from './tauri/http'
import { isTauri } from './tauri/invoke'

let QPS = 5
// 校准本地和服务端之间的时间差
let OFFSET = 250
// 间隔时间
let INTERVAL = 1000

const qpsMap = new Map()
const qpsController = () => async (config: any) => {
  if (config.url.indexOf('aliyundrive') < 0 && config.url.indexOf('alipan') < 0) return config
  const now = Math.trunc(performance.timeOrigin + performance.now())
  let { count, ts } = qpsMap.get(config.url) || { count: 1, ts: now }
  // 通过位运算实现取整，提高效率
  if ((now / INTERVAL) >> 0 <= (ts / INTERVAL) >> 0) {
    // 如果当前时间 ≤ Map中该接口的ts时间，说明前面已经有超过并发后在等待的请求了
    // 只比较秒，忽略毫秒，因为QPS是以秒为周期计算的，即每秒多少个请求数
    if (count < QPS) {
      // 如果当前url的请求数没有达到QPS的限制，则计数器+1
      count++
    } else {
      // 否则，重置计数器，同时将时间戳设置为当前ts的下一整秒
      // 这里需要将ts设置为当前ts的下一秒，而不是当前时间，因为当前ts可能已经远大于当前时间了
      ts = INTERVAL * Math.ceil(ts / INTERVAL + 1)
      count = 1
    }
  } else {
    // 否则：当前时间大于ts，说明已经没有排队的请求了（可能有未完成的，但是都已经请求了）
    // 则将当前ts重置
    ts = now
    count = 1
  }

  qpsMap.set(config.url, { count, ts })
  // 计算休眠时间：
  // 由于本地服务器和远程服务器之间可能存在时间差，添加 OFFSET 偏移值来纠正，若出现 QPS 超限，请酌情增大此值
  let sleep = ts - now
  sleep = sleep > 0 ? sleep + OFFSET : 0
  // 让当前的请求睡一会儿再请求
  if (sleep > 0) {
    await new Promise<void>(resolve => setTimeout(() => resolve(), sleep))
  }
  return config
}

axios.interceptors.request.use(qpsController())
axios.defaults.withCredentials = false
// Every request (including `import axios from 'axios'` elsewhere) goes through the Rust HTTP client.
if (isTauri()) axios.defaults.adapter = tauriAxiosAdapter
export default axios
