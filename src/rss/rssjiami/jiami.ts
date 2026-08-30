import { FileSystemErrorMessage } from '../../utils/filehelper'
import DebugLog from '../../utils/debuglog'
import message from '../../utils/message'
import fs from '../../tauri/fs'
import { invoke } from '../../tauri/invoke'
import path from '../../utils/path'
import { decodeName, encodeName } from '../../module/flow-enc/utils'

export async function DoJiaMi(mode: string,
                              encType: string,
                              encName: boolean,
                              password: string,
                              encPath: string,
                              outPath: string,
                              breakSmall: boolean,
                              matchExtList: string[]): Promise<any> {
  const fileList: { filePath: string, size: number }[] = []
  await GetAllFiles(encPath, breakSmall, fileList)
  if (fileList.length == 0) {
    message.error('选择的文件夹下找不到满足条件的文件')
    return 0
  } else {
    const start = Date.now()
    // flowenc_file only knows the two settings ciphers; RssJiaMi passes 'aesctr' | 'rc4md5' straight through
    const alg: 'aesctr' | 'rc4md5' = encType === 'rc4md5' ? 'rc4md5' : 'aesctr'
    // 输出文件
    if (!(await fs.exists(outPath))) {
      await fs.mkdir(outPath, { recursive: true })
    }
    // 临时文件
    const tempDir = path.join(outPath, '.temp')
    if (!(await fs.exists(tempDir))) {
      await fs.mkdir(tempDir, { recursive: true })
    }
    let promiseArr: Promise<void>[] = []
    let count = 0
    for (const fileInfo of fileList) {
      const { filePath, size } = fileInfo
      const file = filePath.toLowerCase().trimEnd()
      // 过滤扩展
      if (matchExtList.length > 0) {
        let find = false
        for (let j = 0; j < matchExtList.length; j++) {
          if (file.endsWith(matchExtList[j])) {
            find = true
            break
          }
        }
        if (!find) continue
      }
      // 开始加密和解密
      try {
        let relativePath = filePath.substring(encPath.length)
        const fileName = path.basename(relativePath)
        const ext = path.extname(relativePath)
        const childPath = path.dirname(relativePath)
        if (mode === 'enc' && encName) {
          const newFileName = encodeName(password, encType, fileName) + ext
          relativePath = path.join(childPath, newFileName)
        }
        if (mode === 'dec') {
          const newFileName = decodeName(password, encType, ext !== '' ? fileName.substring(0, fileName.length - ext.length) : fileName)
          if (newFileName) {
            relativePath = path.join(childPath, newFileName)
          }
        }
        const outFilePath = path.join(outPath, relativePath)
        const outFilePathTemp = path.join(tempDir, relativePath)
        await fs.mkdir(path.dirname(outFilePath), { recursive: true })
        await fs.mkdir(path.dirname(outFilePathTemp), { recursive: true })
        await fs.writeTextFile(outFilePath, '')
        await fs.writeTextFile(outFilePathTemp, '')
        // 开始加密
        if (size === 0) {
          continue
        }
        // the Rust side reproduces `new FlowEnc(password, encType, size)` + encrypt/decrypt transform (symmetric stream cipher)
        const promise = invoke<number>('flowenc_file', { alg, password, src: filePath, dst: outFilePathTemp })
          .then(() => fs.rename(outFilePathTemp, outFilePath))
          .then(() => {
            count++
          })
          .catch((err: any) => {
            DebugLog.mSaveDanger('XM flowenc ' + (err?.message || '') + filePath)
          })
        promiseArr.push(promise)
        if (promiseArr.length > 50) {
          await Promise.all(promiseArr)
          promiseArr = []
        }
      } catch (err: any) {
        DebugLog.mSaveDanger('XM appendFile' + (err.message || '') + filePath)
      }
    }
    await Promise.all(promiseArr)
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    const time = ((Date.now() - start) / 1000).toFixed(2) + 's'
    return { count, time }
  }
}

async function GetAllFiles(dir: string, breakSmall: boolean, fileList: any[]) {
  if (!dir.endsWith(path.sep)) dir = dir + path.sep
  try {
    const childFiles = await fs.readDir(dir).catch((err: any) => {
      err = FileSystemErrorMessage(err.code, err.message)
      DebugLog.mSaveDanger('XM GetAllFiles文件失败：' + dir, err)
      message.error('跳过文件夹：' + err + ' ' + dir)
      return []
    })

    let allTask: Promise<void>[] = []
    const dirList: string[] = []
    for (let i = 0, maxi = childFiles.length; i < maxi; i++) {
      const name = childFiles[i].name
      if (name.startsWith('.')) continue
      if (name.startsWith('#')) continue
      const item = dir + name
      allTask.push(
        fs
          .lstat(item)
          .then((stat) => {
            if (stat.isDirectory) dirList.push(item)
            else if (stat.isSymlink) {
              // donothing
            } else if (stat.isFile) {
              if (!breakSmall || stat.size > 5 * 1024 * 1024) {
                fileList.push({ filePath: item, size: stat.size })
              }
            }
          })
          .catch(() => {})
      )
      if (allTask.length > 10) {
        await Promise.all(allTask).catch(() => {})
        allTask = []
      }
    }

    if (allTask.length > 0) {
      await Promise.all(allTask).catch(() => {})
      allTask = []
    }

    for (let i = 0, maxi = dirList.length; i < maxi; i++) {
      await GetAllFiles(dirList[i], breakSmall, fileList)
    }
  } catch (err: any) {
    DebugLog.mSaveDanger('GetAllFiles' + (err.message || ''))
  }

  return true
}
