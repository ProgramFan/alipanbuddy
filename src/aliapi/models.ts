export interface IDownloadUrl {
  drive_id: string
  file_id: string
  expire_time: number
  url: string
  size: number
  headers?: Record<string, string>
}





export interface IUploadCreat {
  user_id: string
  drive_id: string
  file_id: string
  israpid: boolean
  isexist: boolean
  upload_id: string
  part_info_list: {
    upload_url: string
    part_number: number
    part_size: number
    isupload: boolean
  }[]
  errormsg: string
}

export interface IUploadInfo {
  token_type: string
  access_token: string
  sha1: string
  israpid: boolean
  isexist: boolean
  part_info_list: {
    upload_url: string
    part_number: number
    part_size: number
    isupload: boolean
  }[]
}

export interface IAliBatchResult {
  count: number
  async_task: {
    drive_id: string
    file_id: string
    task_id: string
    newdrive_id: string
    newfile_id: string
  }[]
  reslut: {
    id: string
    file_id?: string

    name?: string
    type?: string
    parent_file_id?: string

    share_id?: string
    share_pwd?: string
    share_url?: string
    expiration?: string
    share_name?: string

    body?: any
  }[]
  error: {
    id: string
    code: string
    message: string
  }[]
}

export interface IAliUserDriveDetails {
  album_drive_used_size: number
  backup_drive_used_size: number
  default_drive_used_size: number
  drive_total_size: number
  drive_used_size: number
  note_drive_used_size: number
  resource_drive_used_size: number
  sbox_drive_used_size: number
  share_album_drive_used_size: number
}

export interface IAliUserDriveCapacity {
  type: string
  size: number
  sizeStr: string
  expired: string
  expiredstr: string
  description: string
  latest_receive_time: string /* "2022-05-02T00:50:51.379Z" */
}
