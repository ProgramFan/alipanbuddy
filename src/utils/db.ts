import Dexie from 'dexie'
import { ITokenInfo } from '../user/userstore'
import { IOtherShareLinkModel } from '../share/share/OtherShareStore'

class XBYDB3 extends Dexie {
  iobject: Dexie.Table<object, string>
  istring: Dexie.Table<string, string>
  inumber: Dexie.Table<number, string>
  ibool: Dexie.Table<boolean, string>
  icache: Dexie.Table<Blob, string>

  itoken: Dexie.Table<ITokenInfo, string>
  iothershare: Dexie.Table<IOtherShareLinkModel, string>

  constructor() {
    super('XBY3Database')

    this.version(10)
      .stores({
        iobject: '',
        istring: '',
        inumber: '',
        ibool: '',
        icache: '',

        itoken: 'user_id',
        iothershare: 'share_id'
      })

    // v11-v20 added media library / music / book / AI tables that no longer exist.
    // Dropping them here keeps existing user data for the remaining tables.
    this.version(21).stores({
      iobject: '',
      istring: '',
      inumber: '',
      ibool: '',
      icache: '',
      itoken: 'user_id',
      iothershare: 'share_id',
      imusic_track: null,
      ibook_item: null,
      ibook_note: null,
      ibook_bookmark: null,
      ibook_ai_chunk: null,
      ibook_ai_meta: null,
      ibook_ai_bm25: null,
      ibook_ai_conversation: null,
      ibook_ai_message: null,
      imedia_item: null,
      imedia_folder: null,
      imedia_file: null,
      ilibrary_source: null
    })

    this.iobject = this.table('iobject')
    this.istring = this.table('istring')
    this.inumber = this.table('inumber')
    this.ibool = this.table('ibool')
    this.icache = this.table('icache')

    this.itoken = this.table('itoken')
    this.iothershare = this.table('iothershare')
  }

  async getValueString(key: string): Promise<string> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const val = await this.istring.get(key)
    if (val) return val
    else return ''
  }

  async saveValueString(key: string, value: string): Promise<string> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.istring.put(value || '', key)
  }

  async saveValueStringBatch(keys: string[], values: string[]): Promise<string> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.istring.bulkPut(values, keys)
  }

  async getValueNumber(key: string): Promise<number> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const val = await this.inumber.get(key)
    if (val) return val
    return 0
  }

  async saveValueNumber(key: string, value: number): Promise<string> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.inumber.put(value, key)
  }

  async getValueBool(key: string): Promise<boolean> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const val = await this.ibool.get(key)
    if (val) return true
    return false
  }

  async saveValueBool(key: string, value: boolean): Promise<string> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.ibool.put(value || false, key)
  }

  async getValueObject(key: string): Promise<object | undefined> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const val = await this.iobject.get(key)
    if (val) return val
    else return undefined
  }

  async saveValueObject(key: string, value: object): Promise<string | void> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.iobject.put(value, key).catch(() => {})
  }

  async saveValueObjectBatch(keys: string[], values: object[]): Promise<string> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.iobject.bulkPut(values, keys)
  }

  async deleteValueObject(key: string): Promise<void> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.iobject.delete(key)
  }

  async getUser(user_id: string): Promise<ITokenInfo | undefined> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.transaction('r', this.itoken, () => {
      return this.itoken.get(user_id)
    })
  }

  async getUserAll(): Promise<ITokenInfo[]> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const list = await this.transaction('r', this.itoken, () => {
      return this.itoken.toArray()
    })
    return list.sort((a: ITokenInfo, b: ITokenInfo) => b.used_size - a.used_size)
  }

  async deleteUser(user_id: string): Promise<void> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.itoken.delete(user_id)
  }

  async saveUser(token: ITokenInfo): Promise<string | void> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.itoken.put(token, token.user_id).catch(() => {})
  }

  async saveUserBatch(tokens: ITokenInfo[]): Promise<boolean | string> {
    if (tokens.length == 0) return false
    if (!this.isOpen()) await this.open().catch()
    return this.itoken.bulkPut(tokens).catch()
  }

  async getCache(key: string): Promise<Blob | undefined> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const val = await this.icache.get(key)
    return val
  }

  async saveCache(key: string, data: Blob) {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.icache.put(data, key)
  }

  async getOtherShare(share_id: string): Promise<IOtherShareLinkModel | undefined> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.iothershare.get(share_id)
  }

  async getOtherShareAll(): Promise<IOtherShareLinkModel[]> {
    if (!this.isOpen()) await this.open().catch(() => {})
    const list = await this.iothershare.toArray()
    return list.sort((a: IOtherShareLinkModel, b: IOtherShareLinkModel) => b.saved_time - a.saved_time)
  }

  async deleteOtherShareBatch(share_id_list: string[]): Promise<void> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.iothershare.bulkDelete(share_id_list)
  }

  async saveOtherShare(share: IOtherShareLinkModel): Promise<string | void> {
    if (!this.isOpen()) await this.open().catch(() => {})
    return this.iothershare.put(share, share.share_id).catch(() => {})
  }
}

const DB = new XBYDB3()
export default DB
